import { Injectable, OnDestroy, signal } from '@angular/core';

const STORAGE_KEY = 'pb-admin-link-until';
const HOLD_MS = 6_000;
const VISIBLE_MS = 20 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AdminLinkRevealService implements OnDestroy {
  readonly visible = signal(false);

  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  init(): void {
    this.syncFromStorage();
    this.scheduleAutoHide();
  }

  ngOnDestroy(): void {
    this.cancelHold();
    this.clearHideTimer();
  }

  beginHold(): void {
    this.cancelHold();
    this.holdTimer = setTimeout(() => this.activate(), HOLD_MS);
  }

  endHold(): void {
    this.cancelHold();
  }

  private activate(): void {
    const until = Date.now() + VISIBLE_MS;
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

  private cancelHold(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
