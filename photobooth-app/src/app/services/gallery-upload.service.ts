import { Injectable, computed, inject, signal } from '@angular/core';
import { BoothConfigService } from './booth-config.service';

export type GalleryPhotoVariant = 'original' | 'framed' | 'ai';

export interface GalleryUploadRecord {
  path: string;
  variant: GalleryPhotoVariant;
  photoId?: string;
  shareUrl?: string;
  url?: string;
  error?: string;
  status: 'pending' | 'ok' | 'error';
}

@Injectable({ providedIn: 'root' })
export class GalleryUploadService {
  private readonly booth = inject(BoothConfigService);

  private readonly byPath = signal<Record<string, GalleryUploadRecord>>({});
  readonly sessionSlug = signal<string | null>(null);
  readonly galleryUrl = signal<string | null>(null);
  readonly lastError = signal<string | null>(null);

  readonly enabled = computed(() => {
    const g = this.booth.gallery();
    return g.enabled && !!g.apiBaseUrl && !!g.uploadToken;
  });

  recordFor(path: string | null | undefined): GalleryUploadRecord | null {
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
    const g = this.booth.gallery();
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
  }

  async uploadPath(
    filePath: string,
    variant: GalleryPhotoVariant,
  ): Promise<GalleryUploadRecord> {
    const pending: GalleryUploadRecord = { path: filePath, variant, status: 'pending' };
    this.byPath.update((m) => ({ ...m, [filePath]: pending }));

    if (!this.enabled() || !window.pbApi?.galleryUploadPhoto) {
      const err: GalleryUploadRecord = {
        ...pending,
        status: 'error',
        error: 'Gallery upload disabled',
      };
      this.byPath.update((m) => ({ ...m, [filePath]: err }));
      return err;
    }

    const g = this.booth.gallery();
    if (variant === 'original' && !g.uploadOriginal) return this.skip(filePath, variant);
    if (variant === 'framed' && !g.uploadFramed) return this.skip(filePath, variant);
    if (variant === 'ai' && !g.uploadAi) return this.skip(filePath, variant);

    const ensured = await this.ensureDaySession();
    if (!ensured.ok) {
      const err: GalleryUploadRecord = {
        ...pending,
        status: 'error',
        error: ensured.error ?? 'No session',
      };
      this.byPath.update((m) => ({ ...m, [filePath]: err }));
      this.lastError.set(err.error ?? null);
      return err;
    }

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
      : {
          path: filePath,
          variant,
          status: 'error',
          error: r.error ?? 'Upload failed',
        };
    this.byPath.update((m) => ({ ...m, [filePath]: next }));
    if (!r.ok) this.lastError.set(next.error ?? null);
    return next;
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
    return rec;
  }
}
