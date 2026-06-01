import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';

import { Router } from '@angular/router';

import { KiaShellComponent } from '../../components/kia-shell/kia-shell.component';

import { CameraService } from '../../services/camera.service';

import { BoothConfigService } from '../../services/booth-config.service';

import { AiStyleService } from '../../services/ai-style.service';

import { AiGallerySessionService } from '../../services/ai-gallery-session.service';

import { BoothSessionService } from '../../services/booth-session.service';

import { PLAIN_PHOTO_MODE_ID } from '../../models/photobooth-config.model';



type ResultPhase = 'keepsake' | 'download';

type EffectKey = 'none' | 'effect1' | 'effect2' | 'locked3' | 'locked4' | 'locked5';



@Component({

  selector: 'pb-result-page',

  imports: [KiaShellComponent],

  templateUrl: './result-page.component.html',

  styleUrl: './result-page.component.scss',

})

export class ResultPageComponent implements OnInit, OnDestroy {

  readonly booth = inject(BoothConfigService);

  private readonly aiStyle = inject(AiStyleService);

  private readonly gallerySession = inject(AiGallerySessionService);

  private readonly boothSession = inject(BoothSessionService);

  readonly copy = this.booth.copy;



  readonly phase = signal<ResultPhase>('keepsake');

  readonly selectedEffect = signal<EffectKey>('none');



  readonly path = signal<string | null>(null);

  readonly imageDataUrl = signal<string | null>(null);

  readonly err = signal<string | null>(null);

  readonly resultAspectRatio = signal<number | null>(null);



  readonly aiGenerating = signal(false);

  readonly aiErr = signal<string | null>(null);

  readonly aiModelUsed = signal<string | null>(null);

  readonly thinkingStep = signal(0);

  readonly aiEtaSec = signal(22);

  readonly aiElapsedSec = signal(0);

  readonly aiEtaLabel = computed(() => this.formatDuration(this.aiEtaSec()));

  readonly aiElapsedLabel = computed(() => this.formatDuration(this.aiElapsedSec()));

  readonly aiOvertime = computed(() => this.aiEtaSec() <= 0);



  readonly effectSlots = computed(() => {

    const modes = this.booth.aiModes();

    return [

      {

        key: 'effect1' as const,

        icon: 'kia/effect1.svg',

        label: modes[0]?.label ?? 'effect1',

        locked: modes.length < 1 || !this.booth.aiGenerationEnabled(),

        modeId: modes[0]?.id ?? null,

      },

      {

        key: 'effect2' as const,

        icon: 'kia/effect2.svg',

        label: modes[1]?.label ?? 'effect2',

        locked: modes.length < 2 || !this.booth.aiGenerationEnabled(),

        modeId: modes[1]?.id ?? null,

      },

      { key: 'locked3' as const, icon: 'kia/lockedeffect.svg', label: 'effect locked', locked: true, modeId: null },

      { key: 'locked4' as const, icon: 'kia/lockedeffect.svg', label: 'effect locked', locked: true, modeId: null },

      { key: 'locked5' as const, icon: 'kia/lockedeffect.svg', label: 'effect locked', locked: true, modeId: null },

    ];

  });



  private aiTimer?: ReturnType<typeof setInterval>;



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

    this.selectEffect('none');

  }



  selectEffect(key: EffectKey): void {

    if (key.startsWith('locked')) return;

    this.selectedEffect.set(key);

    this.aiErr.set(null);

    if (key === 'none') {

      this.aiStyle.selectMode(PLAIN_PHOTO_MODE_ID);

      return;

    }

    const slot = this.effectSlots().find((s) => s.key === key);

    if (slot?.modeId) {

      this.aiStyle.selectMode(slot.modeId);

    }

  }



  async confirmKeepsake(): Promise<void> {

    const key = this.selectedEffect();

    if (key === 'effect1' || key === 'effect2') {

      const slot = this.effectSlots().find((s) => s.key === key);

      if (slot?.modeId && this.booth.openAiConfigured()) {

        await this.generateAi();

        return;

      }

    }

    this.phase.set('download');

  }



  async generateAi(): Promise<void> {

    const pp = this.path();

    const modeId = this.aiStyle.selectedModeId();

    const mode = modeId ? this.booth.aiModes().find((m) => m.id === modeId) : null;

    if (!pp || !mode || !window.pbApi?.openAiGenerateImage) {

      this.phase.set('download');

      return;

    }

    this.aiGenerating.set(true);

    this.aiErr.set(null);

    this.aiModelUsed.set(null);

    this.thinkingStep.set(0);

    this.startAiCountdown(22);

    try {

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



  startAgain(): void {

    this.stopAiCountdown();

    this.gallerySession.clear();

    this.aiStyle.clear();

    this.boothSession.clear();

    void this.camera.closeSession().catch(() => {});

    void this.router.navigate(['/']);

  }



  async uploadToHub(): Promise<void> {

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

