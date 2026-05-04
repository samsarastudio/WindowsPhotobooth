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
import type { PbCameraResult } from '../../../types/pb-api';

/** Target EVF refresh rate; bridge keeps live view open — interval mainly limits UI work. */
const PREVIEW_FPS = 24;

@Component({
  selector: 'pb-capture-page',
  templateUrl: './capture-page.component.html',
  styleUrl: './capture-page.component.scss',
})
export class CapturePageComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;

  private readonly booth = inject(BoothConfigService);
  readonly copy = this.booth.copy;

  readonly sdkPreview = signal<SafeUrl | null>(null);
  readonly useWebcam = signal(false);
  readonly hint = signal<string | null>(null);
  readonly countdown = signal<number | null>(null);
  /** Width ÷ height — frame hugs preview pixels without letterboxing when known. */
  readonly previewAspectRatio = signal<number | null>(null);
  readonly showPreviewPlaceholder = computed(() => !this.useWebcam() && !this.sdkPreview());

  private previewTimer?: ReturnType<typeof setInterval>;
  private countdownTimer?: ReturnType<typeof setInterval>;
  private mediaStream?: MediaStream;
  private previewPath = '';
  private started = false;

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

    this.started = true;
    this.beginCaptureCycle();
  }

  private startSdkPreview(): void {
    if (!this.previewPath) return;
    const intervalMs = Math.max(16, Math.round(1000 / PREVIEW_FPS));
    this.previewTimer = setInterval(async () => {
      const res = await this.camera.previewFrame(this.previewPath);
      this.applyPreviewResult(res);
    }, intervalMs);
  }

  private applyPreviewResult(res: PbCameraResult): void {
    if (!res.ok) return;
    if (res.previewFileUrl) {
      const u = `${res.previewFileUrl}?t=${Date.now()}`;
      this.sdkPreview.set(this.sanitizer.bypassSecurityTrustUrl(u));
    } else if (res.imageBase64) {
      this.sdkPreview.set(this.sanitizer.bypassSecurityTrustUrl(res.imageBase64));
    }
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

  private startCountdown(): void {
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
        await this.navigateResult(path);
      }
      return;
    }

    const res = await this.camera.capture(outPath);
    if (res.ok && res.path) {
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
    await this.router.navigate(['/result'], { state: { path: filePath } });
  }

  onPreviewImgLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement;
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
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    if (this.started) {
      void this.camera.closeSession();
    }
  }
}
