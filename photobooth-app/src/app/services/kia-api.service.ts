import { Injectable } from '@angular/core';
import type {
  PbKiaEnqueueMediaEntry,
  PbKiaFetchFramesResult,
  PbKiaFetchGalleryResult,
  PbKiaImportUploadQueueResult,
  PbKiaProcessUploadQueueResult,
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

  processUploadQueue(): Promise<PbKiaProcessUploadQueueResult> {
    if (window.pbApi?.kiaProcessUploadQueue) {
      return window.pbApi.kiaProcessUploadQueue();
    }
    return Promise.resolve({ ok: false, error: 'Upload queue unavailable' });
  }

  removeUploadQueueItem(uploadId: string): Promise<{ ok: boolean; pending?: number; error?: string }> {
    if (window.pbApi?.kiaRemoveUploadQueueItem) {
      return window.pbApi.kiaRemoveUploadQueueItem(uploadId);
    }
    return Promise.resolve({ ok: false, error: 'Upload queue unavailable' });
  }

  async importUploadQueueFromOldBuild(): Promise<PbKiaImportUploadQueueResult> {
    if (!window.pbApi?.kiaPickOldBuildFolder || !window.pbApi?.kiaImportUploadQueueFromFolder) {
      return { ok: false, error: 'Import requires the Electron app.' };
    }
    const pick = await window.pbApi.kiaPickOldBuildFolder();
    if (!pick.ok) {
      return pick.canceled ? { ok: false, canceled: true } : { ok: false, error: pick.error || 'Folder pick failed' };
    }
    if (!pick.path) {
      return { ok: false, error: 'No folder selected.' };
    }
    return window.pbApi.kiaImportUploadQueueFromFolder(pick.path);
  }

  testConnection(): Promise<{ ok: boolean; statusCode?: number; message?: string; error?: string }> {
    if (window.pbApi?.kiaTestConnection) {
      return window.pbApi.kiaTestConnection();
    }
    return Promise.resolve({ ok: false, error: 'API unavailable' });
  }
}
