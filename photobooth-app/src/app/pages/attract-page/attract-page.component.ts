import { Component, inject } from '@angular/core';
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
}
