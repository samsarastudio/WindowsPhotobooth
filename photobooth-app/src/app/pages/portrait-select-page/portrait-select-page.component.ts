import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { AiStyleService } from '../../services/ai-style.service';

@Component({
  selector: 'pb-portrait-select-page',
  imports: [RouterLink],
  templateUrl: './portrait-select-page.component.html',
  styleUrl: './portrait-select-page.component.scss',
})
export class PortraitSelectPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly router = inject(Router);
  private readonly aiStyle = inject(AiStyleService);
  readonly branding = inject(BrandingLogoService);

  readonly copy = this.booth.copy;
  readonly characters = this.booth.portraitAiModes;
  readonly thumbUrls = signal<Record<string, string>>({});
  readonly thumbsLoading = signal(false);

  readonly hasChars = computed(() => this.characters().length > 0);
  readonly backLink = computed(() => {
    // Experience picker is /booth-mode; skip ai-mode when portraits are the AI entry.
    return '/booth-mode';
  });

  ngOnInit(): void {
    if (!this.booth.aiGenerationEnabled() || !this.hasChars()) {
      void this.router.navigate(['/booth-mode']);
      return;
    }
    void this.loadThumbs();
  }

  async loadThumbs(): Promise<void> {
    this.thumbsLoading.set(true);
    const next: Record<string, string> = {};
    try {
      if (window.pbApi?.adminListCompositions) {
        const r = await window.pbApi.adminListCompositions();
        if (r.ok && Array.isArray(r.items)) {
          for (const item of r.items) {
            if (item?.modeId && item.url) next[item.modeId] = item.url;
          }
        }
      }
      // Per-character fallback (same Zyn file:// path).
      if (window.pbApi?.adminGetComposition) {
        for (const c of this.characters()) {
          if (next[c.id]) continue;
          try {
            const one = await window.pbApi.adminGetComposition(c.id);
            if (one.ok && one.url) next[c.id] = one.url;
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    } finally {
      this.thumbUrls.set(next);
      this.thumbsLoading.set(false);
    }
  }

  choose(id: string): void {
    this.aiStyle.selectMode(id);
    void this.router.navigate(['/capture']);
  }

  thumbFor(id: string): string | null {
    return this.thumbUrls()[id] || null;
  }
}
