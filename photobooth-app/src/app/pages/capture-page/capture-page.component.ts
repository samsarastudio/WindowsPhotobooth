import {
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
import { AiStyleService } from '../../services/ai-style.service';
import { PLAIN_PHOTO_MODE_ID } from '../../models/photobooth-config.model';
import type { PbCameraResult } from '../../../types/pb-api';

function previewTargetFps(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return 15;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 8;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lowCpu =
    typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || lowCpu ? 12 : 15;
}

function withPreviewDecodeKey(fileUrl: string, v: number): string {
  const sep = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${sep}v=${v}`;
}

import { KiaShellComponent } from '../../components/kia-shell/kia-shell.component';

@Component({
  selector: 'pb-capture-page',
  imports: [KiaShellComponent],
  templateUrl: './capture-page.component.html',
  styleUrl: './capture-page.component.scss',
})
export class CapturePageComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  private readonly booth = inject(BoothConfigService);
  private readonly session = inject(BoothSessionService);
  private readonly aiStyle = inject(AiStyleService);
  readonly copy = this.booth.copy;

  /** Label for the style chosen on `/ai-mode`, if any. */
  readonly selectedStyleLabel = computed(() => {
    const id = this.aiStyle.selectedModeId();
    if (!id) return null;
    if (id === PLAIN_PHOTO_MODE_ID) {
      return this.copy().aiMode.plainPhotoLabel;
    }
    return this.booth.aiModes().find((m) => m.id === id)?.label ?? null;
  });

  /** Double-buffered file preview — swap layer only after decode to avoid blank flicker. */
  readonly sdkPreviewActiveLayer = signal<0 | 1>(0);
  readonly sdkPreviewUrl0 = signal<SafeUrl | null>(null);
  readonly sdkPreviewUrl1 = signal<SafeUrl | null>(null);
  readonly sdkPreviewHasFrame = signal(false);
  readonly useWebcam = signal(false);
  readonly hint = signal<string | null>(null);
  readonly countdown = signal<number | null>(null);
  /** Width ÷ height — frame hugs preview pixels without letterboxing when known. */
  readonly previewAspectRatio = signal<number | null>(null);
  readonly showPreviewPlaceholder = computed(
    () => !this.useWebcam() && !this.sdkPreviewHasFrame(),
  );

  private previewTimer?: ReturnType<typeof setInterval>;
  private countdownTimer?: ReturnType<typeof setInterval>;
  private mediaStream?: MediaStream;
  private previewPath = '';
  private started = false;
  private previewFrameSeq = 0;
  /** Monotonic id written into each preview URL `?v=` — drops stale `(load)` after rapid swaps. */
  private layerSeq: [number, number] = [0, 0];
  /** Pending double-buffer reveal: must match layer + same `?v=` as `layerSeq[layer]`. */
  private pendingReveal: { layer: 0 | 1; decodeV: number } | null = null;
  private previewRafPending = false;

  /** 1×1 transparent gif so `<img [src]>` is always valid before the first EVF frame. */
  readonly emptyPreviewSrc: SafeUrl;

  constructor(
    private readonly camera: CameraService,
    private readonly router: Router,
    private readonly sanitizer: DomSanitizer,
  ) {
    this.emptyPreviewSrc = this.sanitizer.bypassSecurityTrustUrl(
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    );
  }

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

    this.started = true;
    this.beginCaptureCycle();
  }

  private startSdkPreview(): void {
    if (!this.previewPath) return;
    const fps = previewTargetFps();
    const intervalMs = Math.max(24, Math.round(1000 / fps));
    this.previewTimer = setInterval(() => {
      void this.tickSdkPreview();
    }, intervalMs);
  }

  /** One preview poll; RAF-coalesced so bursty timers do not pile up on slow devices. */
  private async tickSdkPreview(): Promise<void> {
    if (this.previewRafPending) return;
    this.previewRafPending = true;
    requestAnimationFrame(async () => {
      this.previewRafPending = false;
      try {
        const res = await this.camera.previewFrame(this.previewPath);
        this.applyPreviewResult(res);
      } catch (_) {
        /* preview errors are benign; bridge may miss a frame */
      }
    });
  }

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
    const safe = this.sanitizer.bypassSecurityTrustUrl(raw);

    if (!this.sdkPreviewHasFrame()) {
      this.layerSeq[0] = v;
      this.sdkPreviewUrl0.set(safe);
      this.sdkPreviewActiveLayer.set(0);
      this.sdkPreviewHasFrame.set(true);
      this.pendingReveal = null;
      return;
    }

    const active = this.sdkPreviewActiveLayer();
    const inactive = active === 0 ? 1 : 0;
    this.layerSeq[inactive] = v;
    this.pendingReveal = { layer: inactive, decodeV: v };
    if (inactive === 0) {
      this.sdkPreviewUrl0.set(safe);
    } else {
      this.sdkPreviewUrl1.set(safe);
    }
  }

  /** Decode marker from URL so out-of-order image `load` does not reveal the wrong frame. */
  private parseImgDecodeV(img: HTMLImageElement): number {
    const s = img.currentSrc || img.src || '';
    const q = s.match(/[?&]v=(\d+)/);
    if (q) return parseInt(q[1], 10);
    const h = s.match(/#pbv=(\d+)/);
    if (h) return parseInt(h[1], 10);
    return -1;
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

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
    this.countdown.set(null);
  }

  private startCountdown(): void {
    this.clearCountdown();
    let n = 5;
    this.countdown.set(n);
    this.countdownTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.countdown.set(0);
        void this.captureShot();
      } else {
        this.countdown.set(n);
      }
    }, 1000);
  }

  private beginCaptureCycle(): void {
    if (!this.useWebcam() && !this.previewTimer) {
      this.startSdkPreview();
    }
    this.startCountdown();
  }

  private async captureShot(): Promise<void> {
    this.clearCountdown();
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = undefined;
    }

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
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
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

  /** After decode: reveal buffered layer, then refresh aspect from the visible layer. */
  onSdkPreviewLayerDecoded(ev: Event, layer: 0 | 1): void {
    const img = ev.target as HTMLImageElement;
    const decodedV = this.parseImgDecodeV(img);
    if (decodedV < 0 || decodedV !== this.layerSeq[layer]) {
      return;
    }

    const pr = this.pendingReveal;
    if (pr !== null) {
      if (pr.layer !== layer || pr.decodeV !== decodedV) {
        return;
      }
      this.sdkPreviewActiveLayer.set(layer);
      this.pendingReveal = null;
    } else if (this.sdkPreviewActiveLayer() !== layer) {
      return;
    }

    if (img.naturalWidth <= 1 && img.naturalHeight <= 1) {
      return;
    }
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.previewAspectRatio.set(img.naturalWidth / img.naturalHeight);
    }
  }

  onVideoMeta(ev: Event): void {
    const v = ev.target as HTMLVideoElement;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      this.previewAspectRatio.set(v.videoWidth / v.videoHeight);
    }
  }

  ngOnDestroy(): void {
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.clearCountdown();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    if (this.started) {
      void this.camera.closeSession();
    }
  }
}
