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

  readonly hasChars = computed(() => this.characters().length > 0);

  ngOnInit(): void {
    if (!this.booth.aiGenerationEnabled() || !this.hasChars()) {
      void this.router.navigate(['/ai-mode']);
      return;
    }
    void this.loadThumbs();
  }

  async loadThumbs(): Promise<void> {
    const next: Record<string, string> = {};
    for (const c of this.characters()) {
      next[c.id] = `/config/compositions/${c.id}/composition.png`;
    }
    this.thumbUrls.set(next);
  }

  choose(id: string): void {
    this.aiStyle.selectMode(id);
    void this.router.navigate(['/capture']);
  }

  thumbFor(id: string): string | null {
    return this.thumbUrls()[id] || null;
  }
}
