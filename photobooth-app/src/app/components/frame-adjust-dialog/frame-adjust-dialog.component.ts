import {
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { BoothConfigService } from '../../services/booth-config.service';
import {
  PHYSICAL_PHOTO_CROP_DEFAULT,
  type PhysicalPhotoCrop,
  clampPhysicalCrop,
  computeRotatedCrop,
} from '../../models/physical-frame-layout';

@Component({
  selector: 'pb-frame-adjust-dialog',
  templateUrl: './frame-adjust-dialog.component.html',
  styleUrl: './frame-adjust-dialog.component.scss',
})
export class FrameAdjustDialogComponent implements OnDestroy, AfterViewInit {
  private readonly booth = inject(BoothConfigService);
  readonly copy = this.booth.copy;

  readonly imagePath = input.required<string>();
  readonly frameFile = input.required<string>();
  readonly busy = input(false);
  readonly confirmLabel = input<string | null>(null);

  readonly confirmed = output<PhysicalPhotoCrop>();
  readonly cancelled = output<void>();

  @ViewChild('sheetCanvas') sheetCanvas?: ElementRef<HTMLCanvasElement>;

  readonly zoom = signal(PHYSICAL_PHOTO_CROP_DEFAULT.zoom);
  readonly panX = signal(PHYSICAL_PHOTO_CROP_DEFAULT.panX);
  readonly panY = signal(PHYSICAL_PHOTO_CROP_DEFAULT.panY);
  readonly err = signal<string | null>(null);
  readonly ready = signal(false);

  private photo: HTMLImageElement | null = null;
  private frame: HTMLImageElement | null = null;
  private hole = { left: 0, top: 0, width: 1, height: 1 };
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private loadGen = 0;

  constructor() {
    effect(() => {
      const path = this.imagePath();
      const frame = this.frameFile();
      void this.load(path, frame);
    });
    effect(() => {
      this.zoom();
      this.panX();
      this.panY();
      this.ready();
      this.draw();
    });
  }

  ngAfterViewInit(): void {
    this.draw();
  }

  ngOnDestroy(): void {
    this.loadGen += 1;
    this.photo = null;
    this.frame = null;
  }

  crop(): PhysicalPhotoCrop {
    return clampPhysicalCrop({ zoom: this.zoom(), panX: this.panX(), panY: this.panY() });
  }

  zoomBy(delta: number): void {
    this.zoom.set(Math.min(4, Math.max(1, Math.round((this.zoom() + delta) * 20) / 20)));
  }

  onZoomInput(ev: Event): void {
    const v = Number((ev.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.zoom.set(Math.min(4, Math.max(1, v)));
  }

  onPointerDown(ev: PointerEvent): void {
    if (this.busy()) return;
    const canvas = this.sheetCanvas?.nativeElement;
    if (!canvas) return;
    canvas.setPointerCapture(ev.pointerId);
    this.dragging = true;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.dragging || this.busy()) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    const canvas = this.sheetCanvas?.nativeElement;
    if (!canvas) return;
    const z = this.zoom();
    const span = Math.max(80, Math.min(canvas.clientWidth, canvas.clientHeight) * 0.35 * z);
    this.panX.set(Math.min(1, Math.max(-1, this.panX() - dx / span)));
    this.panY.set(Math.min(1, Math.max(-1, this.panY() - dy / span)));
  }

  onPointerUp(ev: PointerEvent): void {
    const canvas = this.sheetCanvas?.nativeElement;
    if (canvas?.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    this.dragging = false;
  }

  confirm(): void {
    if (this.busy() || !this.ready()) return;
    this.confirmed.emit(this.crop());
  }

  cancel(): void {
    if (this.busy()) return;
    this.cancelled.emit();
  }

  private async load(filePath: string, frameFile: string): Promise<void> {
    const gen = ++this.loadGen;
    this.ready.set(false);
    this.err.set(null);
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
    this.photo = null;
    this.frame = null;
    if (!filePath || !frameFile || !window.pbApi?.readFileBase64 || !window.pbApi.listPhotoFrames) {
      this.err.set('Preview needs Electron.');
      return;
    }
    try {
      const listed = await window.pbApi.listPhotoFrames();
      const item = listed.frames?.find((f) => f.filename === frameFile);
      if (!item?.url) {
        this.err.set('Frame not found.');
        return;
      }
      const photoUrl = await window.pbApi.readFileBase64(filePath);
      if (gen !== this.loadGen) return;
      const [photo, frame] = await Promise.all([this.loadImg(photoUrl), this.loadImg(item.url)]);
      if (gen !== this.loadGen) return;
      this.photo = photo;
      this.frame = frame;
      this.hole = this.findHole(frame);
      this.ready.set(true);
      queueMicrotask(() => this.draw());
    } catch (e) {
      if (gen !== this.loadGen) return;
      this.err.set(String(e));
    }
  }

  private loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image.'));
      img.src = src;
    });
  }

  /** Bounding box of the transparent / keyed-black photo opening. */
  private findHole(img: HTMLImageElement): { left: number; top: number; width: number; height: number } {
    const maxW = 720;
    const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        left: img.naturalWidth * 0.08,
        top: img.naturalHeight * 0.08,
        width: img.naturalWidth * 0.84,
        height: img.naturalHeight * 0.84,
      };
    }
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const isHole = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      return a < 16 || (r <= 18 && g <= 18 && b <= 18);
    };
    const seeds: [number, number][] = [
      [Math.floor(w / 2), Math.floor(h / 2)],
      [Math.floor(w / 2), Math.floor(h * 0.38)],
      [Math.floor(w / 2), Math.floor(h * 0.28)],
    ];
    let best = { count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const seenGlobal = new Uint8Array(w * h);
    for (const [sx, sy] of seeds) {
      if (!isHole(sx, sy) || seenGlobal[sy * w + sx]) continue;
      const q = [sy * w + sx];
      seenGlobal[q[0]] = 1;
      let count = 0;
      let minX = w;
      let minY = h;
      let maxX = 0;
      let maxY = 0;
      while (q.length) {
        const p = q.pop()!;
        const x = p % w;
        const y = (p / w) | 0;
        if (!isHole(x, y)) continue;
        count += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        const nbs = [p - 1, p + 1, p - w, p + w];
        for (const n of nbs) {
          if (n < 0 || n >= w * h || seenGlobal[n]) continue;
          const nx = n % w;
          const ny = (n / w) | 0;
          if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
          seenGlobal[n] = 1;
          q.push(n);
        }
      }
      if (count > best.count) best = { count, minX, minY, maxX, maxY };
    }
    const inv = 1 / scale;
    if (best.count < 80 || best.count / (w * h) < 0.08) {
      return {
        left: img.naturalWidth * 0.08,
        top: img.naturalHeight * 0.08,
        width: img.naturalWidth * 0.84,
        height: img.naturalHeight * 0.84,
      };
    }
    return {
      left: best.minX * inv,
      top: best.minY * inv,
      width: (best.maxX - best.minX + 1) * inv,
      height: (best.maxY - best.minY + 1) * inv,
    };
  }

  private draw(): void {
    const canvas = this.sheetCanvas?.nativeElement;
    const photo = this.photo;
    const frame = this.frame;
    if (!canvas || !photo || !frame || !this.ready()) return;
    const fw = frame.naturalWidth;
    const fh = frame.naturalHeight;
    const cssW = Math.min(720, canvas.parentElement?.clientWidth || 720);
    const cssH = cssW * (fh / Math.max(1, fw));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, cssW, cssH);

    const sx = (this.hole.left / fw) * cssW;
    const sy = (this.hole.top / fh) * cssH;
    const sw = (this.hole.width / fw) * cssW;
    const sh = (this.hole.height / fh) * cssH;
    const box = computeRotatedCrop(photo.naturalWidth, photo.naturalHeight, sw, sh, this.crop());
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    ctx.drawImage(photo, box.left, box.top, box.width, box.height, sx, sy, sw, sh);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cssW, cssH);
    ctx.rect(sx, sy, sw, sh);
    ctx.clip('evenodd');
    ctx.drawImage(frame, 0, 0, cssW, cssH);
    ctx.restore();
  }
}
