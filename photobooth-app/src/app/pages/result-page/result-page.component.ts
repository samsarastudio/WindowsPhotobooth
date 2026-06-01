import { Component, OnDestroy, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CameraService } from '../../services/camera.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { AiStyleService } from '../../services/ai-style.service';
import { AiGallerySessionService } from '../../services/ai-gallery-session.service';
import { BoothSessionService } from '../../services/booth-session.service';
import { PLAIN_PHOTO_MODE_ID } from '../../models/photobooth-config.model';

@Component({
  selector: 'pb-result-page',
  templateUrl: './result-page.component.html',
  styleUrl: './result-page.component.scss',
})
export class ResultPageComponent implements OnInit, OnDestroy {
  readonly booth = inject(BoothConfigService);
  private readonly aiStyle = inject(AiStyleService);
  private readonly gallerySession = inject(AiGallerySessionService);
  private readonly boothSession = inject(BoothSessionService);
  readonly copy = this.booth.copy;

  readonly path = signal<string | null>(null);
  readonly imageDataUrl = signal<string | null>(null);
  readonly err = signal<string | null>(null);
  readonly resultAspectRatio = signal<number | null>(null);

  readonly aiGenerating = signal(false);
  readonly aiErr = signal<string | null>(null);
  readonly aiModelUsed = signal<string | null>(null);
  /** UI phases while waiting on the Images API — not streamed model reasoning. */
  readonly thinkingStep = signal(0);
  /** Approximate countdown shown while generation runs. */
  readonly aiEtaSec = signal(22);
  readonly aiElapsedSec = signal(0);
  readonly aiEtaLabel = computed(() => this.formatDuration(this.aiEtaSec()));
  readonly aiElapsedLabel = computed(() => this.formatDuration(this.aiElapsedSec()));
  readonly aiOvertime = computed(() => this.aiEtaSec() <= 0);

  private aiTimer?: ReturnType<typeof setInterval>;

  /**
   * Guest chose an AI style (not plain photocapture) while AI flow is enabled.
   */
  readonly showAiSection = computed(() => {
    if (!this.booth.aiGenerationEnabled()) return false;
    const id = this.aiStyle.selectedModeId();
    if (!id || id === PLAIN_PHOTO_MODE_ID) return false;
    return true;
  });

  readonly canRunAiGeneration = computed(
    () => this.showAiSection() && this.booth.openAiConfigured(),
  );

  readonly selectedMode = computed(() => {
    const id = this.aiStyle.selectedModeId();
    if (!id) return null;
    return this.booth.aiModes().find((m) => m.id === id) ?? null;
  });

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
    } catch (e) {
      this.err.set(String(e));
    }
  }

  async generateAi(): Promise<void> {
    if (!this.canRunAiGeneration()) {
      return;
    }
    const pp = this.path();
    const mode = this.selectedMode();
    if (!pp || !mode || !window.pbApi?.openAiGenerateImage) {
      return;
    }
    this.aiGenerating.set(true);
    this.aiErr.set(null);
    this.aiModelUsed.set(null);
    this.thinkingStep.set(0);
    this.startAiCountdown(22);
    try {
      await new Promise<void>((r) => setTimeout(r, 220));
      this.thinkingStep.set(1);
      await new Promise<void>((r) => setTimeout(r, 380));
      this.thinkingStep.set(2);
      await new Promise<void>((r) => setTimeout(r, 320));
      this.thinkingStep.set(3);
      const r = await window.pbApi.openAiGenerateImage({
        imagePath: pp,
        prompt: mode.prompt,
      });
      if (!r.ok || !r.path) {
        this.aiErr.set(r.error ?? 'Generation failed.');
        return;
      }
      this.aiModelUsed.set(r.model ?? null);
      this.gallerySession.setPair(pp, r.path);
      void this.router.navigate(['/ai-gallery']);
    } catch (e) {
      this.aiErr.set(String(e));
    } finally {
      this.stopAiCountdown();
      this.aiGenerating.set(false);
      this.thinkingStep.set(0);
    }
  }

  retake(): void {
    this.gallerySession.clear();
    this.aiErr.set(null);
    void this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/capture']);
  }

  async submit(): Promise<void> {
    this.stopAiCountdown();
    this.gallerySession.clear();
    this.aiStyle.clear();
    const pp = this.path();
    if (pp) this.boothSession.addPhoto(pp);
    const ended = this.boothSession.finalize();
    if (ended?.token && ended.photos.length > 0 && window.pbApi?.syncEnqueueSession) {
      await window.pbApi.syncEnqueueSession({ token: ended.token, photos: ended.photos });
    }
    void this.camera.closeSession().catch(() => {});
    void this.router.navigate(['/']);
  }

  onResultImgLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.resultAspectRatio.set(img.naturalWidth / img.naturalHeight);
    }
  }

  ngOnDestroy(): void {
    this.stopAiCountdown();
  }

  private startAiCountdown(seconds: number): void {
    this.stopAiCountdown();
    this.aiEtaSec.set(seconds);
    this.aiElapsedSec.set(0);
    this.aiTimer = setInterval(() => {
      this.aiElapsedSec.update((v) => v + 1);
      this.aiEtaSec.update((v) => Math.max(0, v - 1));
    }, 1000);
  }

  private stopAiCountdown(): void {
    if (this.aiTimer) {
      clearInterval(this.aiTimer);
      this.aiTimer = undefined;
    }
  }

  private formatDuration(totalSec: number): string {
    const safe = Math.max(0, Math.floor(totalSec));
    const m = String(Math.floor(safe / 60)).padStart(2, '0');
    const s = String(safe % 60).padStart(2, '0');
    return `${m}:${s}`;
  }
}
