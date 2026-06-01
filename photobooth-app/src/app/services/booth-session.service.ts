import { Injectable, signal } from '@angular/core';

export interface BoothSession {
  token: string;
  startedAt: string;
  photos: string[];
}

@Injectable({ providedIn: 'root' })
export class BoothSessionService {
  private readonly _session = signal<BoothSession | null>(null);

  readonly session = this._session.asReadonly();
  readonly token = () => this._session()?.token ?? null;
  readonly hasSession = () => !!this._session();

  start(token: string): void {
    this._session.set({
      token: token.trim(),
      startedAt: new Date().toISOString(),
      photos: [],
    });
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
