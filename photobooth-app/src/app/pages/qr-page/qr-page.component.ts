import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';

@Component({
  selector: 'pb-qr-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './qr-page.component.html',
  styleUrl: './qr-page.component.scss',
})
export class QrPageComponent {
  private readonly booth = inject(BoothConfigService);
  readonly branding = inject(BrandingLogoService);
  readonly copy = this.booth.copy;
  code = '';
  readonly debugInput = signal('');
  readonly message = signal('');

  constructor(private readonly router: Router) {}

  onSubmit(): void {
    const bypass = this.copy().qr.bypassCode.trim();
    if (this.code.trim() === bypass) {
      this.router.navigate(['/capture']);
      return;
    }
    this.message.set(this.copy().qr.invalidCode);
  }

  onDebugEnter(): void {
    if (this.debugInput().trim().toLowerCase() === 'ok') {
      this.router.navigate(['/capture']);
    }
  }
}
