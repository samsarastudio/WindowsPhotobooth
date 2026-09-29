import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { AiStyleService } from '../../services/ai-style.service';

@Component({
  selector: 'pb-scene-select-page',
  imports: [RouterLink],
  templateUrl: './scene-select-page.component.html',
  styleUrl: './scene-select-page.component.scss',
})
export class SceneSelectPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly router = inject(Router);
  private readonly aiStyle = inject(AiStyleService);
  readonly branding = inject(BrandingLogoService);

  readonly copy = this.booth.copy;
  readonly scenes = signal<{ filename: string; label: string; url: string }[]>([]);
  readonly thumbsLoading = signal(false);
  readonly sceneModeId = computed(() => {
    const m =
      this.booth.primaryAiModes().find((x) => x.pipeline === 'scene') ||
      this.booth.primaryAiModes()[0];
    return m?.id || 'scene';
  });

  readonly hasScenes = computed(() => this.scenes().length > 0);
  readonly backLink = computed(() => '/booth-mode');

  ngOnInit(): void {
    if (!this.booth.aiGenerationEnabled()) {
      void this.router.navigate(['/booth-mode']);
      return;
    }
    const modeId = this.sceneModeId();
    this.aiStyle.selectMode(modeId);
    void this.loadScenes(modeId);
  }

  private labelFor(filename: string): string {
    return filename
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  async loadScenes(modeId: string): Promise<void> {
    this.thumbsLoading.set(true);
    try {
      if (!window.pbApi?.adminListAiBackgrounds) {
        this.scenes.set([]);
        return;
      }
      const r = await window.pbApi.adminListAiBackgrounds(modeId);
      const items = (r.backgrounds || [])
        .filter((b) => !!b?.filename && !!b?.url)
        .map((b) => ({
          filename: b.filename,
          label: this.labelFor(b.filename),
          url: b.url,
        }));
      this.scenes.set(items);
    } catch {
      this.scenes.set([]);
    } finally {
      this.thumbsLoading.set(false);
    }
  }

  choose(filename: string): void {
    this.aiStyle.selectMode(this.sceneModeId());
    this.aiStyle.selectBackground(filename);
    void this.router.navigate(['/capture']);
  }
}
