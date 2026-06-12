import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BoothConfigService } from '../../services/booth-config.service';
import { AiGallerySessionService } from '../../services/ai-gallery-session.service';
import { BoothSessionService } from '../../services/booth-session.service';
import { KiaApiService } from '../../services/kia-api.service';
import { AiStyleService } from '../../services/ai-style.service';
import { CameraService } from '../../services/camera.service';

@Component({
  selector: 'pb-ai-gallery-page',
  imports: [RouterLink],
  templateUrl: './ai-gallery-page.component.html',
  styleUrl: './ai-gallery-page.component.scss',
})
export class AiGalleryPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly router = inject(Router);
  private readonly session = inject(AiGallerySessionService);
  private readonly boothSession = inject(BoothSessionService);
  private readonly kiaApi = inject(KiaApiService);
  private readonly aiStyle = inject(AiStyleService);
  private readonly camera = inject(CameraService);

  readonly copy = this.booth.copy;

  /** Which image is shown large — thumbnails pick the other. */
  readonly heroKind = signal<'original' | 'ai'>('ai');

  readonly originalDataUrl = signal<string | null>(null);
  readonly aiDataUrl = signal<string | null>(null);
  readonly err = signal<string | null>(null);
  readonly heroAspectRatio = signal<number | null>(null);

  readonly heroSrc = computed(() =>
    this.heroKind() === 'original' ? this.originalDataUrl() : this.aiDataUrl(),
  );

  async ngOnInit(): Promise<void> {
    if (!this.session.hasPair()) {
      void this.router.navigate(['/result']);
      return;
    }
    const orig = this.session.originalPath()!;
    const ai = this.session.aiPath()!;
    if (!window.pbApi?.readFileBase64) {
      this.err.set('Gallery needs Electron.');
      return;
    }
    try {
      const [o, a] = await Promise.all([
        window.pbApi.readFileBase64(orig),
        window.pbApi.readFileBase64(ai),
      ]);
      this.originalDataUrl.set(o);
      this.aiDataUrl.set(a);
    } catch (e) {
      this.err.set(String(e));
    }
  }

  pickHero(kind: 'original' | 'ai'): void {
    this.heroKind.set(kind);
    this.heroAspectRatio.set(null);
  }

  onHeroLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.heroAspectRatio.set(img.naturalWidth / img.naturalHeight);
    }
  }

  backToResult(): void {
    const p = this.session.originalPath();
    if (p) {
      void this.router.navigate(['/result'], { state: { path: p } });
    } else {
      void this.router.navigate(['/result']);
    }
  }

  async finish(): Promise<void> {
    const orig = this.session.originalPath();
    const ai = this.session.aiPath();
    if (orig) this.boothSession.addPhoto(orig);
    if (ai) this.boothSession.addPhoto(ai);
    const ended = this.boothSession.finalize();
    if (ended?.token && ended.photos.length > 0) {
      const frameId = ended.selectedFrameId ?? null;
      const sessionToken = ended.sessionData?.trim() || ended.token.trim();
      const guestEmail = ended.guestEmail?.trim() || null;
      for (const imagePath of ended.photos) {
        await this.kiaApi.enqueueMedia({
          sessionToken,
          frameId,
          imagePath,
          guestEmail,
        });
      }
    }
    this.session.clear();
    this.aiStyle.clear();
    await this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/']);
  }
}
