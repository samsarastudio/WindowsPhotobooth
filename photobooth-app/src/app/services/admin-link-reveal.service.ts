import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { BoothConfigService } from './booth-config.service';

const STORAGE_KEY = 'pb-admin-link-until';
const REQUIRED_TAPS = 3;
const TAP_WINDOW_MS = 2_500;
const DEFAULT_VISIBLE_SEC = 300;

@Injectable({ providedIn: 'root' })
export class AdminLinkRevealService implements OnDestroy {
  private readonly booth = inject(BoothConfigService);
  private readonly router = inject(Router);

  readonly visible = signal(false);

  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private tapCount = 0;
  private lastTapAt = 0;
  private navSub: Subscription | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.syncFromStorage();
    this.scheduleAutoHide();
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (this.isBoothHomeUrl(e.urlAfterRedirects)) {
          this.onBoothHome();
        }
      });
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
    this.clearHideTimer();
  }

  /** Called when the guest QR screen is shown (including return from admin). */
  onBoothHome(): void {
    this.resetTapState();
    this.syncFromStorage();
    this.scheduleAutoHide();
  }

  /** Triple-tap the top-left hotspot reveals the admin link. */
  registerTap(): void {
    const now = Date.now();
    if (this.tapCount > 0 && now - this.lastTapAt > TAP_WINDOW_MS) {
      this.tapCount = 0;
    }
    this.lastTapAt = now;
    this.tapCount += 1;
    if (this.tapCount >= REQUIRED_TAPS) {
      this.resetTapState();
      this.activate();
    }
  }

  /** Hide link after sign-out / sign-in; operator must triple-tap again. */
  hide(): void {
    this.resetTapState();
    this.clearHideTimer();
    this.visible.set(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  private visibleMs(): number {
    const sec = Number(this.booth.copy().qr.adminLinkVisibleSeconds);
    const clamped = Number.isFinite(sec) && sec > 0 ? Math.min(sec, 24 * 60 * 60) : DEFAULT_VISIBLE_SEC;
    return clamped * 1000;
  }

  private isBoothHomeUrl(url: string): boolean {
    const path = (url || '').split('?')[0].split('#')[0];
    return path === '/' || path === '';
  }

  private resetTapState(): void {
    this.tapCount = 0;
    this.lastTapAt = 0;
  }

  private activate(): void {
    const until = Date.now() + this.visibleMs();
    try {
      sessionStorage.setItem(STORAGE_KEY, String(until));
    } catch {
      /* kiosk storage may be blocked */
    }
    this.visible.set(true);
    this.scheduleAutoHide();
  }

  private syncFromStorage(): void {
    this.visible.set(this.readVisible());
  }

  private readVisible(): boolean {
    try {
      const until = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
      return Number.isFinite(until) && Date.now() < until;
    } catch {
      return false;
    }
  }

  private scheduleAutoHide(): void {
    this.clearHideTimer();
    let until = 0;
    try {
      until = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
    } catch {
      this.visible.set(false);
      return;
    }
    const remaining = until - Date.now();
    if (!Number.isFinite(until) || remaining <= 0) {
      this.visible.set(false);
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      this.visible.set(false);
    }, remaining);
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
