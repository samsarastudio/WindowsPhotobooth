import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BoothConfigService } from '../../services/booth-config.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';

interface FrameItem {
  filename: string;
  label: string;
  url: string;
}

@Component({
  selector: 'pb-frame-page',
  templateUrl: './frame-page.component.html',
  styleUrl: './frame-page.component.scss',
})
export class FramePageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly galleryUpload = inject(GalleryUploadService);
  private readonly router = inject(Router);
  readonly copy = this.booth.copy;

  readonly photoPath = signal<string | null>(null);
  readonly frames = signal<FrameItem[]>([]);
  readonly selected = signal<string | null>(null);
  readonly busy = signal(false);
  readonly err = signal<string | null>(null);

  readonly selectedFrame = computed(() => {
    const id = this.selected();
    return this.frames().find((f) => f.filename === id) ?? null;
  });

  constructor() {
    const nav = this.router.getCurrentNavigation();
    const p = (nav?.extras?.state as { path?: string } | undefined)?.path;
    if (p) this.photoPath.set(p);
  }

  async ngOnInit(): Promise<void> {
    if (!this.photoPath()) {
      const st = history.state as { path?: string };
      if (st?.path) this.photoPath.set(st.path);
    }
    if (!this.photoPath()) {
      this.err.set('No photo — go back and capture again.');
      return;
    }
    if (!this.booth.photoFrames().enabled) {
      await this.router.navigate(['/result'], { state: { path: this.photoPath() } });
      return;
    }
    await this.loadFrames();
  }

  private async loadFrames(): Promise<void> {
    if (!window.pbApi?.listPhotoFrames) {
      this.err.set('Frames require Electron.');
      return;
    }
    await this.pullFramesFromMoments();
    const r = await window.pbApi.listPhotoFrames();
    if (!r.ok || !r.frames?.length) {
      this.err.set(r.error ?? 'No frames found. Add PNGs under config/photo-frames/.');
      return;
    }
    const allow = this.booth.photoFrames().guestFrameFiles ?? [];
    let available = r.frames;
    if (allow.includes('__none__')) {
      this.err.set('No frames are enabled for guests. Ask an operator to enable frames in Admin → Frames.');
      return;
    }
    if (allow.length > 0) {
      available = r.frames.filter((f) => allow.includes(f.filename));
    }
    if (!available.length) {
      this.err.set('No enabled frames for guests. Enable at least one in Admin → Frames.');
      return;
    }
    this.frames.set(
      available.map((f) => ({
        filename: f.filename,
        label: f.label || f.filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        url: f.url,
      })),
    );
    const def = this.booth.photoFrames().defaultFrameFile;
    const pick =
      (def && this.frames().some((f) => f.filename === def) && def) ||
      this.frames()[0]?.filename ||
      null;
    this.selected.set(pick);
  }

  /** Pull overlays from Moments when online; otherwise keep local frames. */
  private async pullFramesFromMoments(): Promise<void> {
    const g = this.booth.gallery();
    const apiBaseUrl = (g.apiBaseUrl || '').replace(/\/$/, '');
    if (!g.enabled || !apiBaseUrl || !window.pbApi?.gallerySyncFrames) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      await window.pbApi.gallerySyncFrames({
        apiBaseUrl,
        uploadToken: undefined,
        pushLocal: false,
        pruneLocal: false,
        timeoutMs: 2500,
      });
    } catch {
      /* offline Moments should not block the frame picker */
    }
  }

  selectFrame(filename: string): void {
    this.selected.set(filename);
  }

  async applySelected(): Promise<void> {
    const photo = this.photoPath();
    const frame = this.selected();
    if (!photo || !frame || !window.pbApi?.applyPhotoFrame) return;
    this.busy.set(true);
    this.err.set(null);
    try {
      const r = await window.pbApi.applyPhotoFrame({
        imagePath: photo,
        frameFile: frame,
        photoScale: this.booth.photoFrames().photoScale,
      });
      if (r.ok && r.path) {
        // Await uploads before result so Share does not start a second framed POST.
        try {
          await this.galleryUpload.uploadPath(photo, 'original');
          await this.galleryUpload.uploadPath(r.path, 'framed');
        } catch {
          /* result page can retry share upload */
        }
        await this.router.navigate(['/result'], { state: { path: r.path } });
      } else {
        this.err.set(r.error ?? 'Could not apply frame.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async skipFrame(): Promise<void> {
    const photo = this.photoPath();
    if (!photo) return;
    this.galleryUpload.queueUpload(photo, 'original');
    await this.router.navigate(['/result'], { state: { path: photo } });
  }
}
