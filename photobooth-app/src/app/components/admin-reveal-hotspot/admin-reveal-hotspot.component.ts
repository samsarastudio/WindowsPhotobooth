import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AdminLinkRevealService } from '../../services/admin-link-reveal.service';

@Component({
  selector: 'pb-admin-reveal-hotspot',
  template: `
    @if (onBoothHome()) {
      <button
        type="button"
        class="pb-admin-reveal-hotspot"
        tabindex="-1"
        aria-hidden="true"
        (pointerup)="onTap($event)"
      ></button>
    }
  `,
  styles: [
    `
      .pb-admin-reveal-hotspot {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 100000;
        width: 5.5rem;
        height: 5.5rem;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        opacity: 0;
        cursor: default;
        touch-action: manipulation;
        pointer-events: auto;
        -webkit-tap-highlight-color: transparent;
      }

      .pb-admin-reveal-hotspot:focus {
        outline: none;
      }
    `,
  ],
})
export class AdminRevealHotspotComponent {
  private readonly adminReveal = inject(AdminLinkRevealService);
  private readonly router = inject(Router);

  readonly onBoothHome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => this.isBoothHome(e.urlAfterRedirects)),
      startWith(this.isBoothHome(this.router.url)),
    ),
    { initialValue: this.isBoothHome(this.router.url) },
  );

  onTap(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.adminReveal.registerTap();
  }

  private isBoothHome(url: string): boolean {
    const path = (url || '').split('?')[0].split('#')[0];
    return path === '/' || path === '';
  }
}
