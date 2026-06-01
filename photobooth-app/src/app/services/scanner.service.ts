import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ScannerService {
  private readonly _status = signal<string>('disconnected');
  private readonly _lastCode = signal<string | null>(null);
  private readonly _codeSubject = new Subject<string>();
  private unsubscribers: Array<() => void> = [];

  readonly status = this._status.asReadonly();
  readonly lastCode = this._lastCode.asReadonly();
  readonly code$ = this._codeSubject.asObservable();

  startListening(): void {
    this.stopListening();
    if (!window.pbApi?.onScannerCode) return;

    this.unsubscribers.push(
      window.pbApi.onScannerCode(({ code }) => {
        this._lastCode.set(code);
        this._codeSubject.next(code);
      }),
    );
    if (window.pbApi.onScannerStatus) {
      this.unsubscribers.push(
        window.pbApi.onScannerStatus(({ status }) => {
          this._status.set(status);
        }),
      );
    }
    if (window.pbApi.onScannerError) {
      this.unsubscribers.push(
        window.pbApi.onScannerError(() => {
          this._status.set('error');
        }),
      );
    }
    void this.refreshStatus();
  }

  stopListening(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
  }

  async refreshStatus(): Promise<string> {
    if (!window.pbApi?.scannerGetStatus) return this._status();
    const r = await window.pbApi.scannerGetStatus();
    const s = r.status ?? 'disconnected';
    this._status.set(s);
    if (r.lastCode) this._lastCode.set(r.lastCode);
    return s;
  }

  async listPorts() {
    if (!window.pbApi?.scannerListPorts) return [];
    const r = await window.pbApi.scannerListPorts();
    return r.ports ?? [];
  }

  async open(portPath: string, baudRate: number) {
    if (!window.pbApi?.scannerOpen) return { ok: false, status: 'error' };
    const r = await window.pbApi.scannerOpen(portPath, baudRate);
    if (r.status) this._status.set(r.status);
    return r;
  }

  async close() {
    if (!window.pbApi?.scannerClose) return { ok: false };
    const r = await window.pbApi.scannerClose();
    if (r.status) this._status.set(r.status);
    return r;
  }
}
