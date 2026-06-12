import { Injectable } from '@angular/core';
import type {
  PbKiaEnqueueMediaEntry,
  PbKiaFetchFramesResult,
  PbKiaFetchGalleryResult,
  PbKiaUploadQueueStatus,
  PbSyncValidateResult,
} from '../../types/pb-api';

@Injectable({ providedIn: 'root' })
export class KiaApiService {
  validateToken(token: string): Promise<PbSyncValidateResult> {
    if (window.pbApi?.kiaValidateToken) {
      return window.pbApi.kiaValidateToken(token);
    }
    if (window.pbApi?.syncValidateToken) {
      return window.pbApi.syncValidateToken(token);
    }
    return Promise.resolve({ ok: false, valid: false, error: 'API unavailable' });
  }

  fetchFrames(): Promise<PbKiaFetchFramesResult> {
    if (window.pbApi?.kiaFetchFrames) {
      return window.pbApi.kiaFetchFrames();
    }
    return Promise.resolve({ ok: false, frames: [], offline: true });
  }

  enqueueMedia(
    entry: PbKiaEnqueueMediaEntry,
  ): Promise<{ ok: boolean; error?: string; uploadId?: string; queued?: boolean }> {
    if (window.pbApi?.kiaEnqueueMedia) {
      return window.pbApi.kiaEnqueueMedia(entry);
    }
    return Promise.resolve({ ok: false, error: 'Upload queue unavailable' });
  }

  waitForUpload(
    uploadId: string,
    timeoutMs?: number,
  ): Promise<{ ok: boolean; error?: string; lastPublish?: unknown }> {
    if (window.pbApi?.kiaWaitForUpload) {
      return window.pbApi.kiaWaitForUpload(uploadId, timeoutMs);
    }
    return Promise.resolve({ ok: false, error: 'Upload wait unavailable' });
  }

  fetchGallery(): Promise<PbKiaFetchGalleryResult> {
    if (window.pbApi?.kiaFetchGallery) {
      return window.pbApi.kiaFetchGallery();
    }
    return Promise.resolve({ ok: false, items: [], offline: true });
  }

  getUploadQueueStatus(): Promise<PbKiaUploadQueueStatus> {
    if (window.pbApi?.kiaGetUploadQueueStatus) {
      return window.pbApi.kiaGetUploadQueueStatus();
    }
    return Promise.resolve({ ok: false, pending: 0 });
  }

  testConnection(): Promise<{ ok: boolean; statusCode?: number; message?: string; error?: string }> {
    if (window.pbApi?.kiaTestConnection) {
      return window.pbApi.kiaTestConnection();
    }
    return Promise.resolve({ ok: false, error: 'API unavailable' });
  }
}
