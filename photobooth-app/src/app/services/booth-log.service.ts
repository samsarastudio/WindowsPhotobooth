import { Injectable } from '@angular/core';

export type BoothLogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Offline local logging via Electron → `<portable>/logs/photobooth.log`.
 * Safe no-op when not running in Electron.
 */
@Injectable({ providedIn: 'root' })
export class BoothLogService {
  private logFilePath: string | null = null;

  async refreshLogPath(): Promise<string | null> {
    try {
      const paths = await window.pbApi?.getPaths();
      this.logFilePath = paths?.logFile ?? paths?.logsDir ?? null;
      return this.logFilePath;
    } catch {
      return null;
    }
  }

  getCachedLogPath(): string | null {
    return this.logFilePath;
  }

  async log(
    level: BoothLogLevel,
    scope: string,
    message: string,
    detail?: unknown,
  ): Promise<void> {
    try {
      if (!window.pbApi?.log) return;
      const r = await window.pbApi.log({ level, scope, message, detail });
      if (r?.logFile) this.logFilePath = r.logFile;
    } catch {
      /* never break guest flow for logging */
    }
  }

  info(scope: string, message: string, detail?: unknown): Promise<void> {
    return this.log('info', scope, message, detail);
  }

  warn(scope: string, message: string, detail?: unknown): Promise<void> {
    return this.log('warn', scope, message, detail);
  }

  error(scope: string, message: string, detail?: unknown): Promise<void> {
    return this.log('error', scope, message, detail);
  }

  async openLogsFolder(): Promise<{ ok: boolean; path?: string; error?: string }> {
    if (!window.pbApi?.openLogsFolder) {
      return { ok: false, error: 'Logs require Electron.' };
    }
    return window.pbApi.openLogsFolder();
  }
}
