import { Component, inject, input, output, signal } from '@angular/core';
import { BoothConfigService } from '../../services/booth-config.service';

@Component({
  selector: 'pb-print-trouble-dialog',
  templateUrl: './print-trouble-dialog.component.html',
  styleUrl: './print-trouble-dialog.component.scss',
})
export class PrintTroubleDialogComponent {
  private readonly booth = inject(BoothConfigService);

  readonly error = input.required<string>();
  readonly retryLabel = input('Retry print');
  readonly retrying = input(false);

  readonly closed = output<void>();
  readonly retry = output<void>();

  readonly busy = signal(false);
  readonly status = signal<string | null>(null);
  readonly allowWifi = signal(false);

  constructor() {
    this.allowWifi.set(this.booth.print().allowWifiPrinters === true);
  }

  async onWifiToggle(ev: Event): Promise<void> {
    const checked = (ev.target as HTMLInputElement).checked;
    this.allowWifi.set(checked);
    this.busy.set(true);
    this.status.set(checked ? 'Enabling Wi‑Fi printers…' : 'USB printers only…');
    try {
      const print = this.booth.print();
      await this.booth.save({
        print: {
          enabled: print.enabled,
          printerName: print.printerName,
          bleedScale: print.bleedScale,
          framedEdgeInsetMm: print.framedEdgeInsetMm,
          allowWifiPrinters: checked,
        },
      });
      await this.refreshPrinters();
    } catch (e) {
      this.status.set(String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async refreshPrinters(): Promise<void> {
    if (!window.pbApi?.listPrinters) {
      this.status.set('Printer list requires Electron.');
      return;
    }
    this.busy.set(true);
    this.status.set('Refreshing printers…');
    try {
      const r = await window.pbApi.listPrinters({ allowWifi: this.allowWifi() });
      if (!r.ok) {
        this.status.set(r.error || 'Refresh failed.');
        return;
      }
      const n = r.printers?.length ?? 0;
      this.status.set(
        n
          ? `${n} printer${n === 1 ? '' : 's'} available.`
          : 'No printers found. Plug in USB or enable Wi‑Fi printers.',
      );
    } catch (e) {
      this.status.set(String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async repairUsb(): Promise<void> {
    if (!window.pbApi?.repairSelphyUsb) {
      this.status.set('USB repair requires Electron.');
      return;
    }
    this.busy.set(true);
    this.status.set('Fixing SELPHY USB driver… approve the Windows prompt if it appears.');
    try {
      const r = await window.pbApi.repairSelphyUsb();
      const reason = r.repair?.reason || '';
      if (r.repair?.needsReboot) {
        this.status.set(
          'Code 28 remains. Leave the printer plugged in and restart Windows, then Retry print.',
        );
      } else if (reason === 'uac-declined') {
        this.status.set('Windows approval was declined. The USB print driver cannot bind without it.');
      } else if (reason === 'printer-not-present') {
        this.status.set(
          'Windows did not see a live SELPHY USB device. Leave it plugged in and tap Fix SELPHY USB driver again.',
        );
      } else if (r.ok) {
        this.status.set(
          reason === 'already-ok'
            ? 'USB print interface is already bound. Try Retry print.'
            : 'USB driver repair finished. Tap Retry print.',
        );
      } else {
        this.status.set(r.error || 'SELPHY USB repair did not complete.');
      }
    } catch (e) {
      this.status.set(String(e));
    } finally {
      this.busy.set(false);
    }
  }

  onRetry(): void {
    if (this.busy() || this.retrying()) return;
    this.retry.emit();
  }

  onClose(): void {
    if (this.busy() || this.retrying()) return;
    this.closed.emit();
  }
}
