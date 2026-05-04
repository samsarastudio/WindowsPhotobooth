import { Injectable, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class BrandingLogoService {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly rawUrl = signal<string | null>(null);

  /** Trusted URL for `<img [src]>` (Electron file://); null = use emoji icon instead. */
  readonly logoSrc = computed((): SafeResourceUrl | null => {
    const raw = this.rawUrl();
    return raw ? this.sanitizer.bypassSecurityTrustResourceUrl(raw) : null;
  });

  readonly hasLogo = computed(() => this.rawUrl() !== null);

  async refresh(): Promise<void> {
    if (!window.pbApi?.adminGetBrandingLogoUrl) {
      this.rawUrl.set(null);
      return;
    }
    const r = await window.pbApi.adminGetBrandingLogoUrl();
    const url = r.ok && r.url ? r.url : null;
    this.rawUrl.set(url);
  }
}
