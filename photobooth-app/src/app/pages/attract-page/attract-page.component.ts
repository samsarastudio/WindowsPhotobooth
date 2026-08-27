import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { BoothModeService } from '../../services/booth-mode.service';
import { AiStyleService } from '../../services/ai-style.service';

@Component({
  selector: 'pb-attract-page',
  imports: [RouterLink],
  templateUrl: './attract-page.component.html',
  styleUrl: './attract-page.component.scss',
})
export class AttractPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  private readonly boothMode = inject(BoothModeService);
  private readonly aiStyle = inject(AiStyleService);
  readonly branding = inject(BrandingLogoService);
  readonly copy = this.booth.copy;

  /** Guest picks experience mode right after Tap to start. */
  readonly startLink = '/booth-mode';

  ngOnInit(): void {
    this.boothMode.clear();
    this.aiStyle.clear();
  }
}
