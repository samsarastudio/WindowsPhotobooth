import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { BoothModeService } from '../../services/booth-mode.service';
import { AiStyleService } from '../../services/ai-style.service';
import { PLAIN_PHOTO_MODE_ID } from '../../models/photobooth-config.model';

/** Guest experience after Tap to start (not digital vs physical). */
export type GuestExperienceId = 'photoPrint' | 'aiPortrait' | 'scene';

@Component({
  selector: 'pb-booth-mode-page',
  imports: [RouterLink],
  templateUrl: './booth-mode-page.component.html',
  styleUrl: './booth-mode-page.component.scss',
})
export class BoothModePageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly boothMode = inject(BoothModeService);
  private readonly aiStyle = inject(AiStyleService);
  private readonly router = inject(Router);
  readonly branding = inject(BrandingLogoService);

  readonly copy = this.booth.copy;
  readonly thumbs = signal<{ photo?: string | null; portrait?: string | null; scene?: string | null }>(
    {},
  );

  /** Photo Print — framed digital original; magnet optional at the end. */
  readonly showPhotoPrint = computed(() => this.booth.guestModes().defaultEnabled !== false);

  /** AI Halloween Portrait — Choose your haunt. */
  readonly showAiPortrait = computed(
    () => this.booth.aiGenerationEnabled() && this.booth.portraitAiModes().length > 0,
  );

  /** Optional Scene Addition (group scenery) when configured. */
  readonly showScene = computed(() => {
    if (!this.booth.aiGenerationEnabled()) return false;
    return this.booth.primaryAiModes().some((m) => m.pipeline === 'scene' || m.useInpainting);
  });

  readonly experienceCount = computed(() => {
    let n = 0;
    if (this.showPhotoPrint()) n += 1;
    if (this.showAiPortrait()) n += 1;
    if (this.showScene()) n += 1;
    return n;
  });

  ngOnInit(): void {
    this.boothMode.selectMode('default');
    void this.loadThumbs();
    if (this.experienceCount() <= 1) {
      if (this.showAiPortrait() && !this.showPhotoPrint() && !this.showScene()) {
        void this.choose('aiPortrait');
      } else if (this.showScene() && !this.showPhotoPrint() && !this.showAiPortrait()) {
        void this.choose('scene');
      } else {
        void this.choose('photoPrint');
      }
    }
  }

  private async loadThumbs(): Promise<void> {
    const next: { photo?: string | null; portrait?: string | null; scene?: string | null } = {};
    try {
      if (window.pbApi?.listPhotoFrames) {
        const fr = await window.pbApi.listPhotoFrames();
        const first = fr.frames?.[0];
        if (first?.url) next.photo = first.url;
      }
      if (window.pbApi?.adminListCompositions) {
        const r = await window.pbApi.adminListCompositions();
        const item = (r.items || []).find((i) => !!i.url);
        if (item?.url) next.portrait = item.url;
      }
      const sceneMode = this.booth.primaryAiModes().find((m) => m.pipeline === 'scene');
      if (sceneMode && window.pbApi?.adminListAiBackgrounds) {
        const bg = await window.pbApi.adminListAiBackgrounds(sceneMode.id);
        if (bg.backgrounds?.[0]?.url) next.scene = bg.backgrounds[0].url;
      }
    } catch {
      /* ignore */
    }
    this.thumbs.set(next);
  }

  choose(id: GuestExperienceId): void {
    this.boothMode.selectMode('default');
    void this.continueAfterChoice(id);
  }

  private async continueAfterChoice(id: GuestExperienceId): Promise<void> {
    if (this.booth.requireQrUnlock()) {
      if (id === 'photoPrint') this.aiStyle.selectMode(PLAIN_PHOTO_MODE_ID);
      else if (id === 'aiPortrait') this.aiStyle.clear();
      else if (id === 'scene') {
        this.aiStyle.clear();
      }
      try {
        sessionStorage.setItem('pb-experience', id);
      } catch {
        /* ignore */
      }
      await this.router.navigate(['/qr']);
      return;
    }
    await this.routeExperience(id);
  }

  private async routeExperience(id: GuestExperienceId): Promise<void> {
    if (id === 'photoPrint') {
      this.aiStyle.selectMode(PLAIN_PHOTO_MODE_ID);
      await this.router.navigate(['/capture']);
      return;
    }
    if (id === 'aiPortrait') {
      await this.router.navigate(['/portrait-select']);
      return;
    }
    if (id === 'scene') {
      const scene =
        this.booth.primaryAiModes().find((m) => m.pipeline === 'scene') ||
        this.booth.primaryAiModes()[0];
      if (scene) this.aiStyle.selectMode(scene.id);
      // Single fixed Scene Addition plate — no multi-scene picker.
      this.aiStyle.selectBackground(null);
      await this.router.navigate(['/capture']);
      return;
    }
    await this.router.navigate(['/capture']);
  }
}
