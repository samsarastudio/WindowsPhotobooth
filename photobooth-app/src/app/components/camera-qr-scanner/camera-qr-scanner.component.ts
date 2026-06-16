import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { BrowserQRCodeReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import type { IScannerControls } from '@zxing/browser';
import { CameraService } from '../../services/camera.service';
import { BoothConfigService } from '../../services/booth-config.service';

const DUPLICATE_COOLDOWN_MS = 3000;
const SDK_DECODE_INTERVAL_MS = 400;

function withPreviewDecodeKey(fileUrl: string, v: number): string {
  const sep = fileUrl.includes('?') ? '&' : '?';
  return `${fileUrl}${sep}v=${v}`;
}

@Component({
  selector: 'pb-camera-qr-scanner',
  templateUrl: './camera-qr-scanner.component.html',
  styleUrl: './camera-qr-scanner.component.scss',
})
export class CameraQrScannerComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('sdkImgEl') sdkImgRef?: ElementRef<HTMLImageElement>;

  private readonly booth = inject(BoothConfigService);

  readonly cameraRotated = computed(
    () => this.booth.camera().orientation !== 'landscape',
  );

  readonly scanSuccess = input(false);

  readonly codeDetected = output<string>();
  readonly detectingChange = output<boolean>();

  readonly useWebcam = signal(false);
  readonly sdkPreviewUrl = signal<SafeUrl | null>(null);
  readonly hint = signal<string | null>(null);
  readonly detecting = signal(false);

  private readonly reader = new BrowserQRCodeReader();
  private mediaStream?: MediaStream;
  private previewTimer?: ReturnType<typeof setInterval>;
  private decodeTimer?: ReturnType<typeof setInterval>;
  private previewPath = '';
  private previewSeq = 0;
  private lastCode = '';
  private lastCodeTime = 0;
  private destroyed = false;
  private videoScanControls?: IScannerControls;

  constructor(
    private readonly camera: CameraService,
    private readonly sanitizer: DomSanitizer,
  ) {}

  async ngOnInit(): Promise<void> {
    const r = await this.camera.initAndOpenFirstCamera();
    this.previewPath = r.previewBasePath;
    this.useWebcam.set(r.useWebcam);
    if (r.useWebcam) {
      await this.startWebcam();
    } else if (this.previewPath) {
      this.startSdkPreviewLoop();
      this.startSdkDecodeLoop();
    } else {
      this.hint.set('Camera unavailable for QR scan.');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.videoScanControls?.stop();
    this.videoScanControls = undefined;
    this.stopLoops();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = undefined;
    void this.camera.closeSession();
  }

  private stopLoops(): void {
    if (this.previewTimer) {
      clearInterval(this.previewTimer);
      this.previewTimer = undefined;
    }
    if (this.decodeTimer) {
      clearInterval(this.decodeTimer);
      this.decodeTimer = undefined;
    }
  }

  private async startWebcam(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      this.mediaStream = stream;
      const video = this.videoRef?.nativeElement;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      this.videoScanControls = await this.reader.decodeFromVideoElement(
        video,
        (result, err) => this.onDecodeResult(result?.getText(), err),
      );
    } catch {
      this.hint.set('Could not start webcam for QR scan.');
    }
  }

  private startSdkPreviewLoop(): void {
    this.previewTimer = setInterval(() => void this.tickSdkPreview(), 200);
  }

  private async tickSdkPreview(): Promise<void> {
    if (!this.previewPath || this.destroyed) return;
    const res = await this.camera.previewFrame(this.previewPath);
    if (!res.ok || !res.previewFileUrl) return;
    this.previewSeq += 1;
    const url = withPreviewDecodeKey(res.previewFileUrl, this.previewSeq);
    this.sdkPreviewUrl.set(this.sanitizer.bypassSecurityTrustUrl(url));
  }

  private startSdkDecodeLoop(): void {
    this.decodeTimer = setInterval(() => void this.decodeFromSdkImage(), SDK_DECODE_INTERVAL_MS);
  }

  private async decodeFromSdkImage(): Promise<void> {
    const img = this.sdkImgRef?.nativeElement;
    if (!img || !img.complete || img.naturalWidth === 0) return;
    try {
      const result = await this.reader.decodeFromImageElement(img);
      this.onDecodeResult(result?.getText(), undefined);
    } catch (e) {
      if (!(e instanceof NotFoundException)) {
        /* ignore transient decode errors */
      }
    }
  }

  private onDecodeResult(text: string | undefined, err: unknown): void {
    if (this.destroyed || this.scanSuccess()) return;
    if (err && !(err instanceof NotFoundException)) return;
    if (!text?.trim()) {
      this.setDetecting(false);
      return;
    }
    const code = text.trim();
    const now = Date.now();
    if (code === this.lastCode && now - this.lastCodeTime < DUPLICATE_COOLDOWN_MS) return;
    this.lastCode = code;
    this.lastCodeTime = now;
    this.setDetecting(true);
    this.codeDetected.emit(code);
  }

  private setDetecting(active: boolean): void {
    if (this.detecting() === active) return;
    this.detecting.set(active);
    this.detectingChange.emit(active);
  }
}
