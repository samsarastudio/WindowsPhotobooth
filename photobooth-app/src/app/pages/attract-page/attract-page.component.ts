import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';

@Component({
  selector: 'pb-attract-page',
  imports: [RouterLink],
  templateUrl: './attract-page.component.html',
  styleUrl: './attract-page.component.scss',
})
export class AttractPageComponent {
  private readonly booth = inject(BoothConfigService);
  readonly branding = inject(BrandingLogoService);
  readonly copy = this.booth.copy;

  /** Skip QR when requireQrUnlock is false — go straight into capture (or AI style if enabled). */
  readonly startLink = computed(() => {
    if (this.booth.requireQrUnlock()) return '/qr';
    if (this.booth.shouldShowAiModeStep()) return '/ai-mode';
    return '/capture';
  });
}
