import { Injectable, inject } from '@angular/core';
import { BoothConfigService } from './booth-config.service';

const LINK_ID = 'pb-theme-pack-stylesheet';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly booth = inject(BoothConfigService);

  async applyFromConfig(): Promise<void> {
    const id = this.booth.activeThemeId();
    document.documentElement.setAttribute('data-pb-theme', id);

    const elOld = document.getElementById(LINK_ID);
    elOld?.remove();

    if (!window.pbApi?.adminGetThemeStylesheetUrl) {
      return;
    }
    const r = await window.pbApi.adminGetThemeStylesheetUrl();
    if (!r.ok || !r.url) {
      return;
    }
    const link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = `${r.url}?v=${Date.now()}`;
    document.head.appendChild(link);
  }
}
