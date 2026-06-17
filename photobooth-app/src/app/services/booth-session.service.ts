import { Injectable, signal } from '@angular/core';

export interface BoothSession {
  token: string;
  sessionData?: string | null;
  guestEmail?: string | null;
  scannedQrToken?: string | null;
  /** QR was accepted locally without live API validate — upload queue will re-validate when online. */
  offlineValidated?: boolean;
  selectedFrameId: number | null;
  startedAt: string;
  photos: string[];
}

@Injectable({ providedIn: 'root' })
export class BoothSessionService {
  private readonly _session = signal<BoothSession | null>(null);

  readonly session = this._session.asReadonly();
  readonly token = () => this._session()?.token ?? null;
  readonly hasSession = () => !!this._session();

  start(
    token: string,
    sessionData?: string | null,
    guestEmail?: string | null,
    options?: { offlineValidated?: boolean; scannedQrToken?: string | null },
  ): void {
    const scannedQrToken =
      this.normalizeSessionToken(options?.scannedQrToken) || token.trim() || null;
    const normalizedSession = this.normalizeSessionToken(sessionData);
    const sessionToken =
      normalizedSession ||
      (options?.offlineValidated === true ? null : this.normalizeSessionToken(token));
    this._session.set({
      token: token.trim(),
      sessionData: sessionToken,
      guestEmail: guestEmail ?? null,
      scannedQrToken,
      offlineValidated: options?.offlineValidated === true,
      selectedFrameId: null,
      startedAt: new Date().toISOString(),
      photos: [],
    });
  }

  private normalizeSessionToken(value: unknown): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const token =
        (typeof obj['token'] === 'string' && obj['token']) ||
        (typeof obj['session_token'] === 'string' && obj['session_token']) ||
        (typeof obj['sessionToken'] === 'string' && obj['sessionToken']) ||
        null;
      return token ? token.trim() : null;
    }
    const s = String(value).trim();
    if (!s || s === '[object Object]') return null;
    return s;
  }

  setSessionData(data: string | null): void {
    const cur = this._session();
    if (!cur) return;
    this._session.set({ ...cur, sessionData: data });
  }

  setSelectedFrameId(frameId: number | null): void {
    const cur = this._session();
    if (!cur) return;
    this._session.set({ ...cur, selectedFrameId: frameId });
  }

  addPhoto(filePath: string): void {
    const cur = this._session();
    if (!cur) return;
    const photos = cur.photos.includes(filePath) ? cur.photos : [...cur.photos, filePath];
    this._session.set({ ...cur, photos });
  }

  clear(): void {
    this._session.set(null);
  }

  finalize(): BoothSession | null {
    const cur = this._session();
    this.clear();
    return cur;
  }
}
