import { Injectable, inject, signal } from '@angular/core';
import type { PhotoboothAiMode } from '../models/photobooth-config.model';
import { GalleryUploadService } from './gallery-upload.service';
import { BoothLogService } from './booth-log.service';

export interface AiBackgroundJobRequest {
  imagePath: string;
  mode: PhotoboothAiMode;
  backgroundFilename?: string | null;
}

/**
 * Runs OpenAI generation + Moments upload without blocking the guest UI.
 * Used when guestFlow.skipAiPreviewToThanks is enabled.
 */
@Injectable({ providedIn: 'root' })
export class AiBackgroundJobService {
  private readonly galleryUpload = inject(GalleryUploadService);
  private readonly log = inject(BoothLogService);

  readonly busy = signal(false);
  readonly lastError = signal<string | null>(null);
  private tail: Promise<void> = Promise.resolve();

  /**
   * Fire-and-forget. Marks the capture as processing on Moments, generates AI,
   * then uploads the AI result and clears processing.
   */
  start(req: AiBackgroundJobRequest): void {
    void this.run(req);
  }

  run(req: AiBackgroundJobRequest): Promise<void> {
    const request = structuredClone(req);
    const announced = this.galleryUpload.uploadPath(request.imagePath, 'original', { processStatus: 'processing' })
      .catch((error) => { void this.log.warn('ai-bg', 'processing upload unavailable', { error: String(error) }); });
    const job = this.tail.then(async () => { await announced; await this.execute(request); });
    this.tail = job.catch(() => undefined);
    return job;
  }

  private async execute(req: AiBackgroundJobRequest): Promise<void> {
    const imagePath = String(req.imagePath || '').trim();
    const mode = req.mode;
    if (!imagePath || !mode || !window.pbApi?.openAiGenerateImage) {
      this.lastError.set('AI background job missing path or API.');
      return;
    }
    this.busy.set(true);
    this.lastError.set(null);
    void this.log.info('ai-bg', 'start', { modeId: mode.id, imagePath });

    try {
      const bg = String(req.backgroundFilename || '').trim();
      const r = await window.pbApi.openAiGenerateImage({
        imagePath,
        prompt: mode.prompt,
        modeId: mode.id,
        useInpainting: mode.useInpainting === true,
        randomizeBackground: !bg && mode.randomizeBackground === true,
        backgroundFilename: bg || undefined,
        inpaintPrompt: mode.inpaintPrompt,
        pipeline: mode.pipeline,
      });
      if (!r.ok || !r.path) {
        const err = r.error ?? 'Generation failed.';
        this.lastError.set(err);
        void this.log.error('ai-bg', 'generate failed', { error: err });
        // Never present a failed AI capture as a finished classic photo.
        void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'failed' });
        return;
      }
      if (r.rawPath && req.mode.pipeline === 'scene') this.galleryUpload.queueUpload(r.rawPath, 'magnet-source');
      const uploaded = await this.galleryUpload.uploadPath(r.path, 'ai', { processStatus: 'ready' });
      if (uploaded.status === 'error') {
        this.lastError.set(uploaded.error ?? 'Photo finished, but backend upload failed.');
        void this.log.error('ai-bg', 'result upload failed', { error: uploaded.error });
        void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'failed' });
        return;
      }
      // A queued result must not clear the tablet's processing state before its
      // image arrives. Moments also completes the family when the AI upload lands.
      if (uploaded.status === 'ok') {
        await this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'ready' });
      }
      void this.log.info('ai-bg', uploaded.status === 'ok' ? 'done' : 'result upload queued', { aiPath: r.path, model: r.model });
    } catch (e) {
      const err = String(e);
      this.lastError.set(err);
      void this.log.error('ai-bg', 'exception', { error: err });
      void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'failed' });
    } finally {
      this.busy.set(false);
    }
  }
}
