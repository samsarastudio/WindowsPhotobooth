import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BoothConfigService } from './booth-config.service';

export type GalleryPhotoVariant = 'original' | 'framed' | 'ai';

export interface GalleryUploadRecord {
  path: string;
  variant: GalleryPhotoVariant;
  photoId?: string;
  shareUrl?: string;
  url?: string;
  error?: string;
  status: 'pending' | 'queued' | 'ok' | 'error';
}

@Injectable({ providedIn: 'root' })
export class GalleryUploadService implements OnDestroy {
  private readonly booth = inject(BoothConfigService);

  private readonly byPath = signal<Record<string, GalleryUploadRecord>>({});
  /** Bumps whenever upload state changes — keeps result Share UI reactive. */
  readonly revision = signal(0);
  readonly sessionSlug = signal<string | null>(null);
  readonly galleryUrl = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);

  readonly enabled = computed(() => {
    const g = this.booth.gallery();
    return g.enabled && !!g.apiBaseUrl && !!g.uploadToken;
  });

  private onlineHandler = () => {
    void this.flushQueue();
  };
  private unsubQueue?: () => void;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      this.unsubQueue = window.pbApi?.onGalleryUploadQueueUpdated?.((item) => {
        this.applyQueueItem(item);
      });
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
    }
    this.unsubQueue?.();
  }

  private bump(): void {
    this.revision.update((n) => n + 1);
  }

  recordFor(path: string | null | undefined): GalleryUploadRecord | null {
    void this.revision();
    if (!path) return null;
    return this.byPath()[path] ?? null;
  }

  shareUrlFor(path: string | null | undefined): string | null {
    const r = this.recordFor(path);
    return r?.status === 'ok' && r.shareUrl ? r.shareUrl : null;
  }

  clearGuestSession(): void {
    this.byPath.set({});
    this.lastError.set(null);
    this.bump();
  }

  todaySlug(): string {
    const prefix = this.booth.gallery().sessionPrefix || 'session';
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${prefix}-${y}-${m}-${day}`;
  }

  async ensureDaySession(): Promise<{ ok: boolean; slug?: string; galleryUrl?: string; error?: string }> {
    if (!this.enabled() || !window.pbApi?.galleryEnsureDaySession) {
      return { ok: false, error: 'Gallery upload disabled' };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { ok: false, error: 'Offline' };
    }
    const g = this.booth.gallery();
    try {
      const r = await window.pbApi.galleryEnsureDaySession({
        apiBaseUrl: g.apiBaseUrl,
        uploadToken: g.uploadToken,
        eventPrefix: g.sessionPrefix,
      });
      if (r.ok) {
        this.sessionSlug.set(r.slug ?? this.todaySlug());
        this.galleryUrl.set(r.galleryUrl ?? null);
      } else {
        this.lastError.set(r.error ?? 'Session ensure failed');
      }
      return r;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  private applyQueueItem(item: {
    filePath?: string;
    variant?: string;
    status?: string;
    photoId?: string;
    shareUrl?: string;
    url?: string;
    error?: string;
  } | null): void {
    if (!item?.filePath) return;
    const status =
      item.status === 'ok' || item.status === 'error' || item.status === 'pending' || item.status === 'queued'
        ? item.status
        : 'queued';
    const rec: GalleryUploadRecord = {
      path: item.filePath,
      variant: (item.variant as GalleryPhotoVariant) || this.inferVariant(item.filePath),
      status,
      photoId: item.photoId,
      shareUrl: item.shareUrl,
      url: item.url,
      error: item.error,
    };
    this.byPath.update((m) => ({ ...m, [item.filePath!]: rec }));
    if (status === 'error') this.lastError.set(item.error ?? null);
    this.bump();
  }

  async flushQueue(): Promise<void> {
    if (!this.enabled() || !window.pbApi?.galleryFlushUploadQueue) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      await window.pbApi.galleryFlushUploadQueue();
    } catch {
      /* offline flush is best-effort */
    }
  }

  async uploadPath(
    filePath: string,
    variant: GalleryPhotoVariant,
  ): Promise<GalleryUploadRecord> {
    const pending: GalleryUploadRecord = { path: filePath, variant, status: 'queued' };
    this.byPath.update((m) => ({ ...m, [filePath]: pending }));
    this.bump();

    if (!this.enabled() || !window.pbApi?.galleryUploadPhoto) {
      const err: GalleryUploadRecord = {
        ...pending,
        status: 'error',
        error: 'Gallery upload disabled',
      };
      this.byPath.update((m) => ({ ...m, [filePath]: err }));
      this.bump();
      return err;
    }

    const g = this.booth.gallery();
    if (variant === 'original' && !g.uploadOriginal) return this.skip(filePath, variant);
    if (variant === 'framed' && !g.uploadFramed) return this.skip(filePath, variant);
    if (variant === 'ai' && !g.uploadAi) return this.skip(filePath, variant);

    const r = await window.pbApi.galleryUploadPhoto({
      apiBaseUrl: g.apiBaseUrl,
      uploadToken: g.uploadToken,
      eventPrefix: g.sessionPrefix,
      filePath,
      variant,
    });

    const next: GalleryUploadRecord = r.ok
      ? {
          path: filePath,
          variant,
          status: 'ok',
          photoId: r.photoId,
          shareUrl: r.shareUrl,
          url: r.url,
        }
      : r.queued || r.status === 'queued' || r.status === 'pending'
        ? {
            path: filePath,
            variant,
            status: 'queued',
            error: r.error,
          }
        : {
            path: filePath,
            variant,
            status: 'error',
            error: r.error ?? 'Upload failed',
          };
    this.byPath.update((m) => ({ ...m, [filePath]: next }));
    if (next.status === 'error') this.lastError.set(next.error ?? null);
    this.bump();
    return next;
  }

  /** Infer variant from capture filename conventions. */
  inferVariant(filePath: string): GalleryPhotoVariant {
    const base = filePath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
    if (base.includes('_ai.') || base.endsWith('_ai.png')) return 'ai';
    if (base.includes('_framed.') || base.includes('_framed_')) return 'framed';
    return 'original';
  }

  /** Ensure the photo shown on result is uploaded so Share can enable. */
  async ensureShareUpload(filePath: string): Promise<GalleryUploadRecord | null> {
    if (!this.enabled() || !filePath) return null;
    const existing = this.byPath()[filePath];
    if (existing?.status === 'ok' && existing.shareUrl) return existing;
    if (existing?.status === 'pending' || existing?.status === 'queued') {
      void this.flushQueue();
      return existing;
    }
    return this.uploadPath(filePath, this.inferVariant(filePath));
  }

  /** Fire-and-forget helper for capture/frame/AI hooks. */
  queueUpload(filePath: string, variant: GalleryPhotoVariant): void {
    void this.uploadPath(filePath, variant);
  }

  private skip(filePath: string, variant: GalleryPhotoVariant): GalleryUploadRecord {
    const rec: GalleryUploadRecord = {
      path: filePath,
      variant,
      status: 'error',
      error: `Upload of ${variant} disabled`,
    };
    this.byPath.update((m) => ({ ...m, [filePath]: rec }));
    this.bump();
    return rec;
  }
}
