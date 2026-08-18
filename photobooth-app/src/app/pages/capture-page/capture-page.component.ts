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
import { BoothConfigService } from '../../services/booth-config.service';
import { BoothLogService } from '../../services/booth-log.service';
import { AiStyleService } from '../../services/ai-style.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';
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

@Component({
  selector: 'pb-capture-page',
  templateUrl: './capture-page.component.html',
  styleUrl: './capture-page.component.scss',
})
export class CapturePageComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  private readonly booth = inject(BoothConfigService);
  private readonly aiStyle = inject(AiStyleService);
  private readonly boothLog = inject(BoothLogService);
  private readonly galleryUpload = inject(GalleryUploadService);
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
  readonly webcamOpening = signal(false);
  readonly cameraReady = signal(false);
  readonly cameraFailed = signal(false);
  readonly logFilePath = signal<string | null>(null);
  readonly hint = signal<string | null>(null);
  readonly countdown = signal<number | null>(null);
  /** Width ÷ height — frame hugs preview pixels without letterboxing when known. */
  readonly previewAspectRatio = signal<number | null>(null);
  /** Placeholder while SDK boots or before webcam stream is attached. */
  readonly showPreviewPlaceholder = computed(
    () =>
      !this.cameraFailed() &&
      !this.cameraReady() &&
      !(this.useWebcam() && !this.webcamOpening()),
  );

  private previewTimer?: ReturnType<typeof setInterval>;
  private countdownTimer?: ReturnType<typeof setInterval>;
  private readyWatchTimer?: ReturnType<typeof setTimeout>;
  private visibilityHandler?: () => void;
  private mediaStream?: MediaStream;
  private previewPath = '';
  private started = false;
  private destroyed = false;
  private previewFrameSeq = 0;
  /** Monotonic id written into each preview URL `?v=` — drops stale `(load)` after rapid swaps. */
  private layerSeq: [number, number] = [0, 0];
  /** Pending double-buffer reveal: must match layer + same `?v=` as `layerSeq[layer]`. */
  private pendingReveal: { layer: 0 | 1; decodeV: number } | null = null;
  private previewRafPending = false;
  private webcamDeviceId: string | null = null;

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
    this.hint.set(this.copy().capture.starting);
    const logPath = await this.boothLog.refreshLogPath();
    this.logFilePath.set(logPath);
    await this.boothLog.info('capture', 'page open', { logFile: logPath });
    const r = await this.camera.initAndOpenFirstCamera();
    if (this.destroyed) return;
    this.previewPath = r.previewBasePath;
    this.webcamDeviceId = r.webcamDeviceId ?? null;
    if (r.lastError) {
      this.hint.set(`Camera SDK unavailable (${r.lastError}). Trying system camera…`);
      await this.boothLog.warn('capture', 'SDK unavailable, trying webcam', r.lastError);
    }
    this.useWebcam.set(r.useWebcam);
    this.started = true;

    if (r.useWebcam) {
      await this.startWebcam();
    } else {
      this.startSdkPreview();
      this.watchForPreviewReady();
    }
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.pauseSdkPreview();
      } else if (!this.destroyed && !this.useWebcam() && !this.cameraFailed() && this.started) {
        this.startSdkPreview();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private pauseSdkPreview(): void {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = undefined;
    }
  }

  async retryCamera(): Promise<void> {
    await this.boothLog.info('capture', 'retryCamera');
    this.cameraFailed.set(false);
    this.cameraReady.set(false);
    this.webcamOpening.set(false);
    this.clearCountdown();
    this.hint.set(this.copy().capture.starting);
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = undefined;
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = undefined;
    }
    await this.camera.closeSession();
    // Force webcam on retry — tablets almost always need the system camera.
    this.useWebcam.set(true);
    this.webcamDeviceId = this.booth.camera().webcamDeviceId;
    await this.startWebcam();
  }

  private startSdkPreview(): void {
    if (!this.previewPath || this.destroyed || document.hidden) return;
    if (this.previewTimer) return;
    const fps = previewTargetFps();
    const intervalMs = Math.max(24, Math.round(1000 / fps));
    this.previewTimer = setInterval(() => {
      void this.tickSdkPreview();
    }, intervalMs);
  }

  /** One preview poll; RAF-coalesced so bursty timers do not pile up on slow devices. */
  private async tickSdkPreview(): Promise<void> {
    if (this.destroyed || document.hidden || this.previewRafPending) return;
    this.previewRafPending = true;
    requestAnimationFrame(async () => {
      this.previewRafPending = false;
      if (this.destroyed || document.hidden || !this.previewTimer) return;
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
      this.markCameraReady();
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
    this.webcamOpening.set(true);
    this.useWebcam.set(true);
    const { stream, error } = await this.camera.openWebcamStream(this.webcamDeviceId);
    if (this.destroyed) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (!stream) {
      this.webcamOpening.set(false);
      this.failCamera(
        error
          ? `System camera unavailable (${error}). Check Windows privacy settings for Camera, then retry.`
          : 'System camera unavailable. Check Windows privacy settings for Camera, then retry.',
      );
      return;
    }
    this.mediaStream = stream;
    this.webcamOpening.set(false);
    let tries = 0;
    const attach = () => {
      if (this.destroyed) return;
      const el = this.videoRef?.nativeElement;
      if (el) {
        el.srcObject = stream;
        el.play().catch(() => {});
        this.watchForPreviewReady();
        return;
      }
      if (tries++ < 60) {
        setTimeout(attach, 50);
      } else {
        this.failCamera('Camera opened but preview could not attach. Tap retry.');
      }
    };
    // Allow Angular to render the <video> after webcamOpening flips false.
    setTimeout(attach, 0);
  }

  private watchForPreviewReady(): void {
    if (this.readyWatchTimer) clearTimeout(this.readyWatchTimer);
    const deadline = Date.now() + 15000;
    const tick = () => {
      if (this.destroyed || this.cameraReady() || this.cameraFailed()) return;
      if (this.useWebcam()) {
        const el = this.videoRef?.nativeElement;
        if (el && el.videoWidth > 0 && el.videoHeight > 0) {
          this.previewAspectRatio.set(el.videoWidth / el.videoHeight);
          this.markCameraReady();
          return;
        }
      } else if (this.sdkPreviewHasFrame()) {
        this.markCameraReady();
        return;
      }
      if (Date.now() >= deadline) {
        if (!this.useWebcam()) {
          // SDK preview never arrived — fall back to system camera.
          void this.boothLog.warn('capture', 'SDK preview timeout — switching to webcam');
          if (this.previewTimer) {
            clearInterval(this.previewTimer);
            this.previewTimer = undefined;
          }
          void this.camera.closeSession();
          this.hint.set('Canon live view unavailable. Switching to system camera…');
          this.useWebcam.set(true);
          void this.startWebcam();
          return;
        }
        this.failCamera(
          'Camera preview timed out. On tablets, allow Camera access for this app in Windows Settings → Privacy → Camera.',
        );
        return;
      }
      this.readyWatchTimer = setTimeout(tick, 200);
    };
    tick();
  }

  private markCameraReady(): void {
    if (this.cameraReady() || this.cameraFailed()) return;
    this.cameraReady.set(true);
    this.hint.set(null);
    void this.boothLog.info('capture', 'camera ready', {
      useWebcam: this.useWebcam(),
      aspect: this.previewAspectRatio(),
    });
    this.beginCaptureCycle();
  }

  private failCamera(message: string): void {
    this.cameraFailed.set(true);
    this.cameraReady.set(false);
    this.clearCountdown();
    this.hint.set(message);
    void this.boothLog.error('capture', 'camera failed', {
      message,
      logFile: this.logFilePath(),
    });
    void this.boothLog.refreshLogPath().then((p) => this.logFilePath.set(p));
  }

  async openLogs(): Promise<void> {
    const r = await this.boothLog.openLogsFolder();
    if (!r.ok) {
      this.hint.set(
        `Could not open logs folder. Look next to the app exe for logs\\photobooth.log (${r.error ?? ''})`,
      );
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
    if (!this.cameraReady() || this.cameraFailed()) return;
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
        this.hint.set('Could not grab a frame — waiting for camera…');
        this.cameraReady.set(false);
        this.watchForPreviewReady();
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
    const framesCfg = this.booth.photoFrames();
    if (framesCfg.enabled) {
      if (framesCfg.autoApplyFrame) {
        await this.autoApplyFrameAndNavigate(filePath);
        return;
      }
      await this.router.navigate(['/frame'], { state: { path: filePath } });
      return;
    }
    this.galleryUpload.queueUpload(filePath, 'original');
    await this.router.navigate(['/result'], { state: { path: filePath } });
  }

  /**
   * Silently pick and composite a frame without showing the frame-selection screen.
   * Chooses `defaultFrameFile` when set; otherwise picks randomly from the allowed set.
   */
  private async autoApplyFrameAndNavigate(filePath: string): Promise<void> {
    if (!window.pbApi?.listPhotoFrames || !window.pbApi?.applyPhotoFrame) {
      // Electron APIs unavailable — fall back to the normal frame picker.
      await this.router.navigate(['/frame'], { state: { path: filePath } });
      return;
    }

    const framesCfg = this.booth.photoFrames();

    const listResult = await window.pbApi.listPhotoFrames();
    if (!listResult.ok || !listResult.frames?.length) {
      // No frames available — show picker so the user at least sees an error.
      await this.router.navigate(['/frame'], { state: { path: filePath } });
      return;
    }

    const allow = framesCfg.guestFrameFiles ?? [];
    let pool = listResult.frames;
    if (!allow.includes('__none__') && allow.length > 0) {
      pool = listResult.frames.filter((f) => allow.includes(f.filename));
    }
    if (!pool.length) {
      await this.router.navigate(['/frame'], { state: { path: filePath } });
      return;
    }

    // Pick frame: prefer explicit default, otherwise random from pool.
    const def = framesCfg.defaultFrameFile;
    const frameFile =
      (def && pool.some((f) => f.filename === def) ? def : null) ??
      pool[Math.floor(Math.random() * pool.length)].filename;

    if (framesCfg.guestTextEnabled) {
      // Caption step is enabled — navigate there so the guest can type their text.
      await this.router.navigate(['/caption'], { state: { path: filePath, frameFile } });
      return;
    }

    const applyResult = await window.pbApi.applyPhotoFrame({
      imagePath: filePath,
      frameFile,
      photoScale: framesCfg.photoScale,
    });

    if (applyResult.ok && applyResult.path) {
      this.galleryUpload.queueUpload(filePath, 'original');
      this.galleryUpload.queueUpload(applyResult.path, 'framed');
      await this.router.navigate(['/result'], { state: { path: applyResult.path } });
    } else {
      // Compositing failed — fall back to picker so the guest knows something went wrong.
      await this.router.navigate(['/frame'], { state: { path: filePath } });
    }
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
      this.markCameraReady();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
    if (this.previewTimer) clearInterval(this.previewTimer);
    if (this.readyWatchTimer) clearTimeout(this.readyWatchTimer);
    this.clearCountdown();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    if (this.started) {
      void this.camera.closeSession();
    }
  }
}
