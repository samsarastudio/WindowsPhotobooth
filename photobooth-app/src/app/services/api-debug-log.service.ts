import { Injectable, computed, inject, signal } from '@angular/core';
import { BoothConfigService } from './booth-config.service';

export interface ApiDebugLogEntry {
  at: string;
  /** e.g. `http`, `frame-preview`, `frame-asset`, `frame-compose` */
  kind?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  ok?: boolean;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
}

const MAX_ENTRIES = 150;

@Injectable({ providedIn: 'root' })
export class ApiDebugLogService {
  private readonly booth = inject(BoothConfigService);
  private readonly entries = signal<ApiDebugLogEntry[]>([]);
  private unsubscribe: (() => void) | null = null;

  readonly enabled = computed(() => this.booth.kiaApi().debugMode === true);
  readonly logs = this.entries.asReadonly();

  constructor() {
    this.bindIpc();
  }

  clear(): void {
    this.entries.set([]);
  }

  /** Local booth events (frame preview, bundled assets, etc.) — same panel as HTTP logs. */
  log(partial: Omit<ApiDebugLogEntry, 'at'> & { at?: string }): void {
    if (!this.enabled()) return;
    this.push({
      at: partial.at ?? new Date().toISOString(),
      ...partial,
    });
  }

  private bindIpc(): void {
    const api = window.pbApi;
    if (!api?.onKiaApiDebug) return;
    this.unsubscribe?.();
    this.unsubscribe = api.onKiaApiDebug((entry) => this.push(entry));
  }

  private push(entry: ApiDebugLogEntry): void {
    if (!this.enabled()) return;
    this.entries.update((list) => {
      const next = [...list, entry];
      if (next.length > MAX_ENTRIES) {
        return next.slice(next.length - MAX_ENTRIES);
      }
      return next;
    });
  }
}
