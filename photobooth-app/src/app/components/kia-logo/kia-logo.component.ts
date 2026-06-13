import { Component, Input, computed, inject } from '@angular/core';
import { BoothConfigService } from '../../services/booth-config.service';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { AdminLinkRevealService } from '../../services/admin-link-reveal.service';

@Component({
  selector: 'pb-kia-logo',
  templateUrl: './kia-logo.component.html',
  styleUrl: './kia-logo.component.scss',
})
export class KiaLogoComponent {
  /** Long-press on logo reveals the admin link (QR landing only). */
  @Input() holdable = false;

  private readonly booth = inject(BoothConfigService);
  private readonly branding = inject(BrandingLogoService);
  private readonly adminReveal = inject(AdminLinkRevealService);

  readonly logoSrc = this.branding.logoSrc;

  readonly logoScale = computed(() => {
    const pct = this.booth.branding().logoScalePercent ?? 100;
    const clamped = Math.min(200, Math.max(50, pct));
    return clamped / 100;
  });

  onHoldStart(ev: PointerEvent): void {
    if (!this.holdable || ev.button !== 0) return;
    this.adminReveal.beginHold();
  }

  onHoldEnd(): void {
    if (!this.holdable) return;
    this.adminReveal.endHold();
  }

  onContextMenu(ev: Event): void {
    if (this.holdable) ev.preventDefault();
  }
}
