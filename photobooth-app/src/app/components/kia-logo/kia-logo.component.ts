import { Component, computed, inject } from '@angular/core';
import { BoothConfigService } from '../../services/booth-config.service';
import { BrandingLogoService } from '../../services/branding-logo.service';

@Component({
  selector: 'pb-kia-logo',
  templateUrl: './kia-logo.component.html',
  styleUrl: './kia-logo.component.scss',
})
export class KiaLogoComponent {
  private readonly booth = inject(BoothConfigService);
  private readonly branding = inject(BrandingLogoService);

  readonly logoSrc = this.branding.logoSrc;

  readonly logoScale = computed(() => {
    const pct = this.booth.branding().logoScalePercent ?? 100;
    const clamped = Math.min(200, Math.max(50, pct));
    return clamped / 100;
  });
}
