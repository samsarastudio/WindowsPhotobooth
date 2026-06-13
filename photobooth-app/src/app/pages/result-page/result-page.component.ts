import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { KiaLogoComponent } from '../../components/kia-logo/kia-logo.component';
import { KiaShellComponent } from '../../components/kia-shell/kia-shell.component';
import { CameraService } from '../../services/camera.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { BoothSessionService } from '../../services/booth-session.service';
import { KiaApiService } from '../../services/kia-api.service';
import { PhotoFramesService } from '../../services/photo-frames.service';
import { ApiDebugLogService } from '../../services/api-debug-log.service';
import type { BoothEffectSlot } from '../../services/photo-frames.service';

type ResultPhase = 'keepsake' | 'uploading' | 'success';
type EffectKey = 'none' | string;

@Component({
  selector: 'pb-result-page',
  imports: [KiaShellComponent, KiaLogoComponent],
  templateUrl: './result-page.component.html',
  styleUrl: './result-page.component.scss',
})
export class ResultPageComponent implements OnInit, OnDestroy {
  readonly booth = inject(BoothConfigService);
  private readonly boothSession = inject(BoothSessionService);
  private readonly kiaApi = inject(KiaApiService);
  private readonly photoFrames = inject(PhotoFramesService);
  private readonly debugLog = inject(ApiDebugLogService);
  readonly copy = this.booth.copy;

  readonly phase = signal<ResultPhase>('keepsake');
  readonly selectedEffect = signal<EffectKey>('none');
  readonly uploadError = signal<string | null>(null);
  readonly autoHomeSecondsLeft = signal<number | null>(null);

  readonly path = signal<string | null>(null);
  readonly imageDataUrl = signal<string | null>(null);
  readonly imageLoadFailed = signal(false);
  readonly err = signal<string | null>(null);

  readonly effectSlots = this.photoFrames.effectSlots;
  readonly overlayPreviewUrl = signal<string | null>(null);
  readonly overlayLoadFailed = signal(false);

  readonly hasFrameSelected = computed(() => this.selectedEffect() !== 'none');
  readonly showFrameOverlay = computed(
    () => Boolean(this.overlayPreviewUrl()) && !this.overlayLoadFailed(),
  );

  private autoHomeInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly router: Router,
    private readonly camera: CameraService,
  ) {
    const nav = this.router.getCurrentNavigation();
    const p = (nav?.extras?.state as { path?: string } | undefined)?.path;
    if (p) {
      this.path.set(p);
    }
  }

  async ngOnInit(): Promise<void> {
    if (!this.path()) {
      const st = history.state as { path?: string };
      if (st?.path) {
        this.path.set(st.path);
      }
    }
    const pp = this.path();
    if (!pp) {
      this.err.set('No image path — go back and capture again.');
      return;
    }
    if (!window.pbApi?.readFileBase64) {
      this.err.set('Preview needs Electron.');
      return;
    }
    try {
      const url = await window.pbApi.readFileBase64(pp);
      this.imageDataUrl.set(url);
      this.imageLoadFailed.set(false);
    } catch (e) {
      this.err.set(String(e));
    }
    this.selectEffect('none');
    await this.photoFrames.loadFrames();
    const key = this.selectedEffect();
    if (key !== 'none') {
      await this.loadOverlayPreview(key);
    }
  }

  onPreviewError(): void {
    this.imageLoadFailed.set(true);
  }

  async selectEffect(key: EffectKey): Promise<void> {
    if (key !== 'none') {
      const slot = this.effectSlots().find((s) => s.key === key);
      if (!slot || slot.locked) return;
    }

    this.selectedEffect.set(key);
    this.overlayLoadFailed.set(false);

    if (key === 'none') {
      this.overlayPreviewUrl.set(null);
      this.boothSession.setSelectedFrameId(null);
      return;
    }

    this.boothSession.setSelectedFrameId(this.photoFrames.frameIdForKey(key));
    await this.loadOverlayPreview(key);
  }

  onOverlayError(): void {
    this.overlayLoadFailed.set(true);
    this.overlayPreviewUrl.set(null);
    this.debugLog.log({
      kind: 'frame-preview',
      method: 'IMG',
      ok: false,
      url: this.selectedEffect(),
      error: 'Frame overlay image failed to decode in browser',
    });
  }

  private async loadOverlayPreview(key: EffectKey): Promise<void> {
    const started = Date.now();
    const slot: BoothEffectSlot | undefined = this.photoFrames.slotForKey(key);
    if (!slot) {
      this.debugLog.log({
        kind: 'frame-preview',
        method: 'LOAD',
        ok: false,
        error: `No slot for key ${key}`,
        durationMs: Date.now() - started,
      });
      this.overlayPreviewUrl.set(null);
      return;
    }

    this.debugLog.log({
      kind: 'frame-preview',
      method: 'LOAD',
      url: key,
      request: {
        frameId: slot.frameId,
        hasDataUrl: Boolean(slot.frameImage?.startsWith('data:')),
        frameImagePath: slot.frameImagePath || null,
        frameImageLen: slot.frameImage?.length ?? 0,
      },
    });

    if (slot.frameImage?.startsWith('data:') && slot.frameImage.length > 100) {
      this.overlayPreviewUrl.set(slot.frameImage);
      this.debugLog.log({
        kind: 'frame-preview',
        method: 'LOAD',
        ok: true,
        url: key,
        response: { source: 'cached-data-url', bytes: slot.frameImage.length },
        durationMs: Date.now() - started,
      });
      return;
    }

    const ref = slot.frameImagePath || slot.frameImage;
    if (ref && window.pbApi?.readFileBase64) {
      try {
        const url = await window.pbApi.readFileBase64(ref);
        this.overlayPreviewUrl.set(url);
        this.debugLog.log({
          kind: 'frame-preview',
          method: 'READ',
          ok: true,
          url: ref.slice(0, 120),
          response: { source: 'readFileBase64', bytes: url.length },
          durationMs: Date.now() - started,
        });
        return;
      } catch (e) {
        this.debugLog.log({
          kind: 'frame-preview',
          method: 'READ',
          ok: false,
          url: ref.slice(0, 120),
          error: String(e),
        });
      }
    }

    if (window.pbApi?.kiaBundledFrameAsset) {
      const bundled = await window.pbApi.kiaBundledFrameAsset(slot.frameId, 'frame_image');
      this.debugLog.log({
        kind: 'frame-asset',
        method: 'BUNDLED',
        ok: bundled.ok,
        url: `frame-${slot.frameId}/frame_image`,
        response: bundled,
      });
      if (bundled.ok && bundled.path && window.pbApi.readFileBase64) {
        try {
          const url = await window.pbApi.readFileBase64(bundled.path);
          this.overlayPreviewUrl.set(url);
          this.debugLog.log({
            kind: 'frame-preview',
            method: 'READ',
            ok: true,
            url: bundled.path.slice(0, 120),
            response: { source: 'bundled', bytes: url.length },
            durationMs: Date.now() - started,
          });
          return;
        } catch (e) {
          this.debugLog.log({
            kind: 'frame-preview',
            method: 'READ',
            ok: false,
            url: bundled.path?.slice(0, 120),
            error: String(e),
          });
        }
      }
    }

    this.overlayPreviewUrl.set(null);
    this.overlayLoadFailed.set(true);
    this.debugLog.log({
      kind: 'frame-preview',
      method: 'LOAD',
      ok: false,
      url: key,
      error: 'All overlay sources failed',
      durationMs: Date.now() - started,
    });
  }

  async confirmKeepsake(): Promise<void> {
    this.uploadError.set(null);
    this.phase.set('uploading');

    const result = await this.enqueueForUpload();
    if (!result.ok) {
      this.uploadError.set(result.error || this.copy().result.uploadError);
      this.phase.set('keepsake');
      return;
    }

    const displaySec = Math.max(1, Number(this.copy().result.uploadMinDisplaySeconds) || 3);
    await new Promise((resolve) => setTimeout(resolve, displaySec * 1000));

    this.phase.set('success');
    this.startAutoHomeTimer();
  }

  /** Queue upload in the background — do not wait for network (offline-safe). */
  private async enqueueForUpload(): Promise<{ ok: boolean; error?: string }> {
    const pp = this.path();
    if (!pp) {
      return { ok: false, error: 'No photo to upload.' };
    }

    this.boothSession.addPhoto(pp);
    const ended = this.boothSession.finalize();
    if (!ended?.token || ended.photos.length === 0) {
      return { ok: false, error: 'Session expired — scan QR again.' };
    }

    const frameId = ended.selectedFrameId ?? null;
    const sessionToken = ended.sessionData?.trim() || ended.token.trim();
    const guestEmail = ended.guestEmail?.trim() || null;
    const frameSlot =
      frameId != null ? this.photoFrames.slotForKey(`frame-${frameId}`) : undefined;

    let uploadId: string | undefined;
    let queued = false;
    for (const imagePath of ended.photos) {
      const enq = await this.kiaApi.enqueueMedia({
        sessionToken,
        frameId,
        frameImagePath: frameSlot?.frameImagePath || null,
        imagePath,
        guestEmail,
      });
      if (!enq.ok) {
        return { ok: false, error: enq.error || this.copy().result.uploadError };
      }
      uploadId = enq.uploadId;
      queued = Boolean(enq.queued);
    }

    if (!uploadId) {
      return { ok: false, error: this.copy().result.uploadError };
    }

    this.debugLog.log({
      kind: 'upload',
      method: 'ENQUEUE',
      ok: true,
      url: uploadId,
      response: {
        queued,
        frameId,
        background: true,
        message: 'Upload queued — will sync when online',
      },
    });

    return { ok: true };
  }

  continueAfterSuccess(): void {
    this.goHome();
  }

  private startAutoHomeTimer(): void {
    this.clearAutoHomeTimer();
    const seconds = Number(this.copy().result.uploadAutoHomeSeconds) || 0;
    if (seconds <= 0) {
      this.autoHomeSecondsLeft.set(null);
      return;
    }
    this.autoHomeSecondsLeft.set(seconds);
    this.autoHomeInterval = setInterval(() => {
      const left = (this.autoHomeSecondsLeft() ?? 0) - 1;
      if (left <= 0) {
        this.goHome();
      } else {
        this.autoHomeSecondsLeft.set(left);
      }
    }, 1000);
  }

  private clearAutoHomeTimer(): void {
    if (this.autoHomeInterval) {
      clearInterval(this.autoHomeInterval);
      this.autoHomeInterval = null;
    }
  }

  private goHome(): void {
    this.clearAutoHomeTimer();
    this.boothSession.clear();
    void this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.clearAutoHomeTimer();
  }
}
