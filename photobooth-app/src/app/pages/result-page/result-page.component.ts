import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CameraService } from '../../services/camera.service';
import { BoothConfigService } from '../../services/booth-config.service';

@Component({
  selector: 'pb-result-page',
  templateUrl: './result-page.component.html',
  styleUrl: './result-page.component.scss',
})
export class ResultPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  readonly copy = this.booth.copy;

  readonly path = signal<string | null>(null);
  readonly imageDataUrl = signal<string | null>(null);
  readonly err = signal<string | null>(null);
  readonly resultAspectRatio = signal<number | null>(null);

  constructor(
    private readonly router: Router,
    private readonly camera: CameraService,
  ) {
    const nav = this.router.getCurrentNavigation();
    const p = (nav?.extras?.state as { path?: string } | undefined)?.path;
    if (p) {
      this.path.set(p);
    }
  }

  async ngOnInit(): Promise<void> {
    if (!this.path()) {
      const st = history.state as { path?: string };
      if (st?.path) {
        this.path.set(st.path);
      }
    }
    const pp = this.path();
    if (!pp) {
      this.err.set('No image path — go back and capture again.');
      return;
    }
    if (!window.pbApi?.readFileBase64) {
      this.err.set('Preview needs Electron.');
      return;
    }
    try {
      const url = await window.pbApi.readFileBase64(pp);
      this.imageDataUrl.set(url);
    } catch (e) {
      this.err.set(String(e));
    }
  }

  retake(): void {
    void this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/capture']);
  }

  submit(): void {
    void this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/']);
  }

  onResultImgLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.resultAspectRatio.set(img.naturalWidth / img.naturalHeight);
    }
  }
}
