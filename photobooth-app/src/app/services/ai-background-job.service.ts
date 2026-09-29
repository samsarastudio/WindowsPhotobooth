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

  /**
   * Fire-and-forget. Marks the capture as processing on Moments, generates AI,
   * then uploads the AI result and clears processing.
   */
  start(req: AiBackgroundJobRequest): void {
    void this.run(req);
  }

  async run(req: AiBackgroundJobRequest): Promise<void> {
    const imagePath = String(req.imagePath || '').trim();
    const mode = req.mode;
    if (!imagePath || !mode || !window.pbApi?.openAiGenerateImage) {
      this.lastError.set('AI background job missing path or API.');
      return;
    }
    if (this.busy()) {
      void this.log.warn('ai-bg', 'job already running — skipping');
      return;
    }
    this.busy.set(true);
    this.lastError.set(null);
    void this.log.info('ai-bg', 'start', { modeId: mode.id, imagePath });

    // Show a processing card on the tablet immediately.
    void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'processing' });

    try {
      const bg = String(req.backgroundFilename || '').trim();
      const r = await window.pbApi.openAiGenerateImage({
        imagePath,
        prompt: mode.prompt,
        modeId: mode.id,
        useInpainting: mode.useInpainting === true,
        randomizeBackground: mode.pipeline === 'scene' ? !bg : mode.randomizeBackground !== false,
        backgroundFilename: bg || undefined,
        inpaintPrompt: mode.inpaintPrompt,
        pipeline: mode.pipeline,
      });
      if (!r.ok || !r.path) {
        const err = r.error ?? 'Generation failed.';
        this.lastError.set(err);
        void this.log.error('ai-bg', 'generate failed', { error: err });
        // Still mark original ready so tablet can print the capture.
        void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'ready' });
        return;
      }
      void this.galleryUpload.uploadPath(r.path, 'ai', { processStatus: 'ready' });
      void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'ready' });
      void this.log.info('ai-bg', 'done', { aiPath: r.path, model: r.model });
    } catch (e) {
      const err = String(e);
      this.lastError.set(err);
      void this.log.error('ai-bg', 'exception', { error: err });
      void this.galleryUpload.uploadPath(imagePath, 'original', { processStatus: 'ready' });
    } finally {
      this.busy.set(false);
    }
  }
}
