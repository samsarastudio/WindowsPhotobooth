import { Injectable, inject } from '@angular/core';
import { BoothConfigService } from './booth-config.service';

/** KIA booth uses built-in styles only — no theme packs. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly booth = inject(BoothConfigService);

  async applyFromConfig(): Promise<void> {
    document.documentElement.setAttribute('data-pb-theme', 'default');
  }
}
