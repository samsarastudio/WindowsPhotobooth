import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { CameraService } from '../../services/camera.service';
import { BoothSessionService } from '../../services/booth-session.service';
import { BoothConfigService } from '../../services/booth-config.service';
import type { PbCameraResult } from '../../../types/pb-api';

function previewTargetFps(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return 24;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 12;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lowCpu =
    typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || lowCpu ? 18 : 24;
}

function withPreviewDecodeKey(fileUrl: string, v: number): string {
  const sep = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${sep}v=${v}`;
}

import { KiaLogoComponent } from '../../components/kia-logo/kia-logo.component';
import { KiaShellComponent } from '../../components/kia-shell/kia-shell.component';

@Component({
  selector: 'pb-capture-page',
  imports: [KiaShellComponent, KiaLogoComponent],
  templateUrl: './capture-page.component.html',
  styleUrl: './capture-page.component.scss',
})
export class CapturePageComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('timerVideoEl') timerVideoRef?: ElementRef<HTMLVideoElement>;

  private readonly booth = inject(BoothConfigService);
  private readonly session = inject(BoothSessionService);
  readonly copy = this.booth.copy;

  readonly cameraRotated = computed(
    () => this.booth.camera().orientation !== 'landscape',
  );

  /** Double-buffered file preview — swap layer only after decode to avoid blank flicker. */
  readonly sdkPreviewActiveLayer = signal<0 | 1>(0);
  readonly sdkPreviewUrl0 = signal<SafeUrl | null>(null);
  readonly sdkPreviewUrl1 = signal<SafeUrl | null>(null);
  readonly sdkPreviewHasFrame = signal(false);
  readonly useWebcam = signal(false);
  readonly hint = signal<string | null>(null);
  readonly countdown = signal<number | null>(null);
  readonly showPreviewPlaceholder = computed(
    () => !this.useWebcam() && !this.sdkPreviewHasFrame(),
  );

  private previewTimer?: ReturnType<typeof setInterval>;
  private captureTimeout?: ReturnType<typeof setTimeout>;
  private mediaStream?: MediaStream;
  private previewPath = '';
  private cameraReady = false;
  private viewReady = false;
  private cycleStarted = false;
  private previewFrameSeq = 0;
  private displayedPreviewSeq = 0;
  private previewWriteSlot: 0 | 1 = 0;
  private previewRafPending = false;
  private previewInFlight = false;
  private countdownPreviewIntervalMs?: number;
  private countdownFinishing = false;
  private timerListenerTarget?: HTMLVideoElement;
  private timerListeners?: {
    ended: () => void;
    timeupdate: () => void;
    stalled: () => void;
    waiting: () => void;
    metadata: () => void;
  };
  private timerStallWatch?: ReturnType<typeof setInterval>;
  private timerLastAdvanceMs = 0;
  private timerLastCurrentTime = 0;
  private destroyed = false;

  constructor(
    private readonly camera: CameraService,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
  ) {}

  async ngOnInit(): Promise<void> {
    const r = await this.camera.initAndOpenFirstCamera();
    this.previewPath = r.previewBasePath;
    if (r.lastError) {
      this.hint.set(`Camera SDK unavailable (${r.lastError}). Using webcam if allowed.`);
    }
    this.useWebcam.set(r.useWebcam);

    if (r.useWebcam) {
      setTimeout(() => void this.startWebcam(), 120);
    } else {
      this.startSdkPreview();
    }

    this.cameraReady = true;
    this.tryStartCaptureCycle();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.tryStartCaptureCycle();
  }

  private tryStartCaptureCycle(): void {
    if (!this.cameraReady || !this.viewReady || this.cycleStarted) return;
    this.cycleStarted = true;
    this.beginCaptureCycle();
  }

  private startSdkPreview(): void {
    if (!this.previewPath) return;
    const fps = previewTargetFps();
    const intervalMs = Math.max(24, Math.round(1000 / fps));
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
    }
    this.previewTimer = setInterval(() => {
      void this.tickSdkPreview();
    }, intervalMs);
  }

  /** One preview poll; RAF-coalesced and serialized so frames do not overlap. */
  private async tickSdkPreview(): Promise<void> {
    if (this.previewInFlight) return;
    if (this.previewRafPending) return;
    this.previewRafPending = true;
    requestAnimationFrame(async () => {
      this.previewRafPending = false;
      if (this.previewInFlight) return;
      this.previewInFlight = true;
      try {
        const slot = this.previewWriteSlot;
        this.previewWriteSlot = slot === 0 ? 1 : 0;
        const res = await this.camera.previewFrame(this.previewPathForSlot(slot), slot);
        this.applyPreviewResult(res);
      } catch (_) {
        /* preview errors are benign; bridge may miss a frame */
      } finally {
        this.previewInFlight = false;
      }
    });
  }

  /** Alternate disk files so Electron never reads a JPEG while Canon is still writing it. */
  private previewPathForSlot(slot: 0 | 1): string {
    const stem = this.previewPath.replace(/(_[01])?\.jpg$/i, '');
    return `${stem}_${slot}.jpg`;
  }

  /** Decode off-DOM first, then swap layers — avoids white flash from empty/partial `<img>` paints. */
  private applyPreviewResult(res: PbCameraResult): void {
    if (!res.ok) return;
    const v = ++this.previewFrameSeq;
    let raw: string | null = null;
    if (res.previewFileUrl) {
      raw = withPreviewDecodeKey(res.previewFileUrl, v);
    } else if (res.imageBase64) {
      raw = `${res.imageBase64}#pbv=${v}`;
    }
    if (!raw) return;

    const probe = new Image();
    probe.decoding = 'sync';
    probe.onload = (): void => {
      if (v <= this.displayedPreviewSeq) return;
      if (probe.naturalWidth <= 1 && probe.naturalHeight <= 1) return;

      const safe = this.sanitizer.bypassSecurityTrustUrl(raw);
      if (!this.sdkPreviewHasFrame()) {
        this.sdkPreviewUrl0.set(safe);
        this.sdkPreviewUrl1.set(safe);
        this.sdkPreviewActiveLayer.set(0);
        this.sdkPreviewHasFrame.set(true);
        this.displayedPreviewSeq = v;
        return;
      }

      const inactive: 0 | 1 = this.sdkPreviewActiveLayer() === 0 ? 1 : 0;
      if (inactive === 0) {
        this.sdkPreviewUrl0.set(safe);
      } else {
        this.sdkPreviewUrl1.set(safe);
      }
      requestAnimationFrame(() => {
        if (v <= this.displayedPreviewSeq) return;
        this.sdkPreviewActiveLayer.set(inactive);
        this.displayedPreviewSeq = v;
      });
    };
    probe.onerror = () => {};
    probe.src = raw;
  }

  private async startWebcam(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      this.mediaStream = stream;
      let tries = 0;
      const attach = () => {
        const el = this.videoRef?.nativeElement;
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
          return;
        }
        if (tries++ < 40) {
          setTimeout(attach, 50);
        }
      };
      attach();
    } catch {
      this.hint.set('Webcam access denied or unavailable.');
    }
  }

  private timerDurationMs(el: HTMLVideoElement): number {
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) {
      return Math.ceil(d * 1000) + 200;
    }
    return 6500;
  }

  private detachTimerListeners(): void {
    if (this.timerStallWatch) {
      clearInterval(this.timerStallWatch);
      this.timerStallWatch = undefined;
    }
    const el = this.timerListenerTarget;
    const listeners = this.timerListeners;
    if (el && listeners) {
      el.removeEventListener('ended', listeners.ended);
      el.removeEventListener('timeupdate', listeners.timeupdate);
      el.removeEventListener('stalled', listeners.stalled);
      el.removeEventListener('waiting', listeners.waiting);
      el.removeEventListener('loadedmetadata', listeners.metadata);
      el.pause();
    }
    this.timerListenerTarget = undefined;
    this.timerListeners = undefined;
  }

  private clearCountdown(): void {
    if (this.captureTimeout) {
      clearTimeout(this.captureTimeout);
      this.captureTimeout = undefined;
    }
    this.detachTimerListeners();
    this.countdown.set(null);
  }

  /** One-shot completion — video `ended` can fail to fire on some Windows tablet GPUs. */
  private finishCountdown(): void {
    if (this.countdownFinishing) return;
    this.countdownFinishing = true;
    this.countdown.set(0);
    void this.captureShot();
  }

  private armCountdownWatchdog(el: HTMLVideoElement, durationMs: number): void {
    if (this.captureTimeout) {
      clearTimeout(this.captureTimeout);
    }
    this.captureTimeout = setTimeout(() => {
      this.captureTimeout = undefined;
      this.finishCountdown();
    }, durationMs);
  }

  private startTimerStallWatch(el: HTMLVideoElement): void {
    this.timerLastAdvanceMs = performance.now();
    this.timerLastCurrentTime = el.currentTime;
    if (this.timerStallWatch) {
      clearInterval(this.timerStallWatch);
    }
    this.timerStallWatch = setInterval(() => {
      if (this.countdownFinishing || this.countdown() === null) return;

      const advanced = el.currentTime > this.timerLastCurrentTime + 0.02;
      if (advanced) {
        this.timerLastCurrentTime = el.currentTime;
        this.timerLastAdvanceMs = performance.now();
        return;
      }

      const stalledForMs = performance.now() - this.timerLastAdvanceMs;
      if (stalledForMs < 1400) return;

      if (el.paused && !el.ended) {
        void el.play().catch(() => {});
        if (stalledForMs < 2800) return;
      }

      this.finishCountdown();
    }, 400);
  }

  private throttlePreviewForCountdown(): void {
    if (this.useWebcam() || !this.previewTimer) return;
    if (this.countdownPreviewIntervalMs !== undefined) return;
    clearInterval(this.previewTimer);
    const normalMs = Math.max(24, Math.round(1000 / previewTargetFps()));
    this.countdownPreviewIntervalMs = normalMs;
    const slowMs = Math.max(120, normalMs * 2);
    this.previewTimer = setInterval(() => {
      void this.tickSdkPreview();
    }, slowMs);
  }

  private restorePreviewAfterCountdown(): void {
    if (this.countdownPreviewIntervalMs === undefined) return;
    const normalMs = this.countdownPreviewIntervalMs;
    this.countdownPreviewIntervalMs = undefined;
    if (!this.previewTimer) return;
    clearInterval(this.previewTimer);
    this.previewTimer = setInterval(() => {
      void this.tickSdkPreview();
    }, normalMs);
  }

  private bindTimerElement(el: HTMLVideoElement): void {
    this.detachTimerListeners();
    this.timerListenerTarget = el;

    const onEnded = (): void => this.finishCountdown();
    const onTimeUpdate = (): void => {
      if (!Number.isFinite(el.duration) || el.duration <= 0) return;
      if (el.ended || el.currentTime >= el.duration - 0.15) {
        this.finishCountdown();
      }
    };
    const nudgePlayback = (): void => {
      if (this.countdownFinishing || el.ended) return;
      void el.play().catch(() => {});
    };
    const onMetadata = (): void => {
      this.armCountdownWatchdog(el, this.timerDurationMs(el));
    };

    this.timerListeners = {
      ended: onEnded,
      timeupdate: onTimeUpdate,
      stalled: nudgePlayback,
      waiting: nudgePlayback,
      metadata: onMetadata,
    };

    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('stalled', nudgePlayback);
    el.addEventListener('waiting', nudgePlayback);
    el.addEventListener('loadedmetadata', onMetadata);
  }

  private beginTimerPlayback(el: HTMLVideoElement): void {
    this.armCountdownWatchdog(el, this.timerDurationMs(el));
    this.startTimerStallWatch(el);

    const playPromise = el.play();
    if (playPromise) {
      void playPromise.catch(() => {
        this.armCountdownWatchdog(el, this.timerDurationMs(el));
      });
    }
  }

  private startCountdown(): void {
    this.countdownFinishing = false;
    this.clearCountdown();
    this.throttlePreviewForCountdown();

    const el = this.timerVideoRef?.nativeElement;
    if (!el) {
      this.countdown.set(1);
      this.captureTimeout = setTimeout(() => this.finishCountdown(), 6500);
      return;
    }

    el.loop = false;
    el.muted = true;
    el.playsInline = true;
    el.currentTime = 0;
    this.countdown.set(1);
    this.bindTimerElement(el);

    if (el.readyState >= 1 && Number.isFinite(el.duration) && el.duration > 0) {
      this.beginTimerPlayback(el);
      return;
    }

    const onReady = (): void => {
      el.removeEventListener('loadedmetadata', onReady);
      el.removeEventListener('canplay', onReady);
      if (this.countdownFinishing || this.countdown() === null) return;
      this.beginTimerPlayback(el);
    };
    el.addEventListener('loadedmetadata', onReady);
    el.addEventListener('canplay', onReady);
    el.load();

    this.armCountdownWatchdog(el, 7500);
  }

  private beginCaptureCycle(): void {
    if (!this.useWebcam() && !this.previewTimer) {
      this.startSdkPreview();
    }
    void this.runCaptureCycleWhenPreviewReady();
  }

  /** Let EVF deliver at least one frame before the countdown hides live updates. */
  private async runCaptureCycleWhenPreviewReady(): Promise<void> {
    if (!this.useWebcam()) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !this.sdkPreviewHasFrame()) {
        if (!this.previewTimer) {
          this.startSdkPreview();
        }
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    if (!this.cycleStarted || this.destroyed) return;
    this.startCountdown();
  }

  private async captureShot(): Promise<void> {
    this.clearCountdown();
    this.countdownFinishing = false;
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = undefined;
    }
    this.countdownPreviewIntervalMs = undefined;

    const paths = await this.camera.getPaths();
    const captureDir = paths?.captureDir ?? '.';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = `${captureDir.replace(/\\/g, '/')}/capture_${ts}.jpg`;

    if (this.useWebcam()) {
      const path = await this.captureWebcamFrame(outPath);
      if (path) {
        this.mediaStream?.getTracks().forEach((t) => t.stop());
        this.mediaStream = undefined;
        await this.camera.closeSession();
        await this.navigateResult(path);
      } else {
        this.beginCaptureCycle();
      }
      return;
    }

    const res = await this.camera.capture(outPath);
    if (res.ok && res.path) {
      await this.camera.closeSession();
      await this.navigateResult(res.path);
      return;
    }
    this.hint.set(`Capture failed (${res.msg ?? res.err}).`);
    if (!this.previewTimer) {
      this.startSdkPreview();
    }
    this.startCountdown();
  }

  private async captureWebcamFrame(targetPath: string): Promise<string | null> {
    const video = this.videoRef?.nativeElement;
    if (!video || !video.videoWidth) {
      return null;
    }
    const rotated = this.cameraRotated();
    const canvas = document.createElement('canvas');
    if (rotated) {
      canvas.width = video.videoHeight;
      canvas.height = video.videoWidth;
    } else {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (rotated) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
    } else {
      ctx.drawImage(video, 0, 0);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    if (!window.pbApi?.saveJpeg) {
      this.hint.set('Cannot save — run inside Electron.');
      return null;
    }
    const r = await window.pbApi.saveJpeg(targetPath.replace(/\\/g, '/'), base64);
    if (!r.ok || !r.path) return null;
    return r.path;
  }

  private async navigateResult(filePath: string): Promise<void> {
    this.session.addPhoto(filePath);
    await this.router.navigate(['/result'], { state: { path: filePath } });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.clearCountdown();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    if (this.cameraReady) {
      void this.camera.closeSession();
    }
  }
}
