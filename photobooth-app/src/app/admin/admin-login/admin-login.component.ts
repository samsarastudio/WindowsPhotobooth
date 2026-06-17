import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TouchNumpadComponent } from '../../components/touch-numpad/touch-numpad.component';
import { enterAdminRoute, leaveAdminRoute } from '../admin-route-body';
import { setAdminSession } from '../admin.guard';

@Component({
  selector: 'pb-admin-login',
  imports: [FormsModule, RouterLink, TouchNumpadComponent],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.scss',
})
export class AdminLoginComponent implements OnInit, OnDestroy {
  pin = '';
  readonly err = signal<string | null>(null);
  readonly busy = signal(false);
  readonly numpadOpen = signal(false);
  readonly shutdownConfirmOpen = signal(false);
  readonly shutdownBusy = signal(false);
  /** Shipped default from `photobooth-config.default.json` (not necessarily the live PIN if config was edited). */
  readonly defaultPin = signal<string | null>(null);
  readonly pinInfoOpen = signal(false);

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    enterAdminRoute();
    void fetch('/config/photobooth-config.default.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const p = j && typeof j['adminPin'] === 'string' ? (j['adminPin'] as string) : null;
        this.defaultPin.set(p ?? '2727');
      })
      .catch(() => this.defaultPin.set('2727'));
  }

  ngOnDestroy(): void {
    leaveAdminRoute();
  }

  togglePinInfo(): void {
    this.pinInfoOpen.update((v) => !v);
  }

  openNumpad(): void {
    this.numpadOpen.set(true);
  }

  closeNumpad(): void {
    this.numpadOpen.set(false);
  }

  onPinInput(event: Event): void {
    event.stopPropagation();
    this.openNumpad();
  }

  openShutdownConfirm(): void {
    this.closeNumpad();
    this.shutdownConfirmOpen.set(true);
  }

  closeShutdownConfirm(): void {
    if (this.shutdownBusy()) return;
    this.shutdownConfirmOpen.set(false);
  }

  async confirmShutdown(): Promise<void> {
    if (!window.pbApi?.shutdownSystem) {
      this.err.set('System shutdown requires the desktop app (Electron).');
      this.shutdownConfirmOpen.set(false);
      return;
    }
    this.shutdownBusy.set(true);
    this.err.set(null);
    try {
      const r = await window.pbApi.shutdownSystem();
      if (!r.ok) {
        this.err.set(r.error || 'Could not shut down the system.');
        this.shutdownBusy.set(false);
        this.shutdownConfirmOpen.set(false);
      }
    } catch (e) {
      this.err.set(String(e));
      this.shutdownBusy.set(false);
      this.shutdownConfirmOpen.set(false);
    }
  }

  async submit(): Promise<void> {
    this.err.set(null);
    this.closeNumpad();
    if (!window.pbApi?.adminVerifyPin) {
      this.err.set('Admin login requires the desktop app (Electron).');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminVerifyPin(this.pin);
      if (r.ok && r.valid) {
        setAdminSession(true);
        await this.router.navigate(['/admin']);
        return;
      }
      this.err.set('Incorrect PIN.');
    } catch (e) {
      this.err.set(String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
