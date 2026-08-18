import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { VirtualKeyboardComponent } from '../../components/virtual-keyboard/virtual-keyboard.component';
import { BoothConfigService } from '../../services/booth-config.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';

@Component({
  selector: 'pb-caption-page',
  imports: [VirtualKeyboardComponent],
  templateUrl: './caption-page.component.html',
  styleUrl: './caption-page.component.scss',
})
export class CaptionPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly galleryUpload = inject(GalleryUploadService);
  private readonly router = inject(Router);
  readonly copy = this.booth.copy;

  readonly photoPath = signal<string | null>(null);
  readonly frameFile = signal<string | null>(null);
  readonly text = signal('');
  readonly busy = signal(false);
  readonly err = signal<string | null>(null);

  readonly framesCfg = this.booth.photoFrames;
  readonly maxLen = computed(() => this.framesCfg().guestTextMaxLength || 36);
  readonly optional = computed(() => this.framesCfg().guestTextOptional !== false);
  readonly credit = computed(() => (this.framesCfg().guestTextCreditLine || '').trim());
  readonly remaining = computed(() => Math.max(0, this.maxLen() - this.text().length));

  constructor() {
    const nav = this.router.getCurrentNavigation();
    const st = nav?.extras?.state as { path?: string; frameFile?: string } | undefined;
    if (st?.path) this.photoPath.set(st.path);
    if (st?.frameFile) this.frameFile.set(st.frameFile);
  }

  async ngOnInit(): Promise<void> {
    if (!this.photoPath() || !this.frameFile()) {
      const st = history.state as { path?: string; frameFile?: string };
      if (st?.path) this.photoPath.set(st.path);
      if (st?.frameFile) this.frameFile.set(st.frameFile);
    }
    if (!this.photoPath() || !this.frameFile()) {
      this.err.set('Missing photo or frame — go back and try again.');
      return;
    }
    if (!this.framesCfg().enabled || !this.framesCfg().guestTextEnabled) {
      await this.applyAndGo(this.text());
    }
  }

  onText(next: string): void {
    this.text.set(next.slice(0, this.maxLen()));
  }

  async continue(): Promise<void> {
    await this.applyAndGo(this.text().trim());
  }

  async skip(): Promise<void> {
    if (!this.optional()) return;
    await this.applyAndGo('');
  }

  private async applyAndGo(guestText: string): Promise<void> {
    const photo = this.photoPath();
    const frame = this.frameFile();
    if (!photo || !frame || !window.pbApi?.applyPhotoFrame) return;
    this.busy.set(true);
    this.err.set(null);
    try {
      const r = await window.pbApi.applyPhotoFrame({
        imagePath: photo,
        frameFile: frame,
        photoScale: this.framesCfg().photoScale,
        guestText: guestText || undefined,
        creditLine: guestText ? this.credit() || undefined : undefined,
      });
      if (r.ok && r.path) {
        this.galleryUpload.queueUpload(photo, 'original');
        this.galleryUpload.queueUpload(r.path, 'framed');
        await this.router.navigate(['/result'], { state: { path: r.path } });
      } else {
        this.err.set(r.error ?? 'Could not apply frame text.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
