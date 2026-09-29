import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BoothConfigService } from '../../services/booth-config.service';
import { AiStyleService } from '../../services/ai-style.service';
import { BoothModeService } from '../../services/booth-mode.service';
import { AiGallerySessionService } from '../../services/ai-gallery-session.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';
import { CameraService } from '../../services/camera.service';

@Component({
  selector: 'pb-thanks-page',
  templateUrl: './thanks-page.component.html',
  styleUrl: './thanks-page.component.scss',
})
export class ThanksPageComponent implements OnInit, OnDestroy {
  private readonly booth = inject(BoothConfigService);
  private readonly router = inject(Router);
  private readonly aiStyle = inject(AiStyleService);
  private readonly boothMode = inject(BoothModeService);
  private readonly gallerySession = inject(AiGallerySessionService);
  private readonly galleryUpload = inject(GalleryUploadService);
  private readonly camera = inject(CameraService);

  readonly copy = this.booth.copy;
  readonly secondsLeft = signal(0);

  private timer?: ReturnType<typeof setInterval>;
  private cleared = false;

  ngOnInit(): void {
    const sec = Math.max(0, Number(this.booth.guestFlow().thanksAutoReturnSec) || 0);
    this.secondsLeft.set(sec);
    if (sec > 0) {
      this.timer = setInterval(() => {
        const next = this.secondsLeft() - 1;
        this.secondsLeft.set(Math.max(0, next));
        if (next <= 0) {
          this.finish();
        }
      }, 1000);
    }
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  finish(): void {
    if (this.cleared) return;
    this.cleared = true;
    this.clearTimer();
    this.gallerySession.clear();
    this.galleryUpload.clearGuestSession();
    this.aiStyle.clear();
    this.boothMode.clear();
    void this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/']);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
