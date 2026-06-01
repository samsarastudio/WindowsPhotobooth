import { Injectable, computed, signal } from '@angular/core';

import type {

  PhotoboothAiMode,

  PhotoboothConfig,

  PhotoboothBranding,

  PhotoboothCopy,

  PhotoboothScannerConfig,

  PhotoboothSyncConfig,

  QrScanMode,

} from '../models/photobooth-config.model';

import {

  PLAIN_PHOTO_MODE_ID,

  PHOTOBOOTH_DEFAULT_AI_MODES,

  PHOTOBOOTH_DEFAULT_BRANDING,

  PHOTOBOOTH_DEFAULT_COPY,

  PHOTOBOOTH_DEFAULT_SCANNER,

  PHOTOBOOTH_DEFAULT_SYNC,

} from '../models/photobooth-config.model';



type CopyPatch = {
  qr?: Partial<PhotoboothCopy['qr']>;
  capture?: Partial<PhotoboothCopy['capture']>;
  result?: Partial<PhotoboothCopy['result']>;
  aiMode?: Partial<PhotoboothCopy['aiMode']>;
};

function mergeCopy(base: PhotoboothCopy, patch?: CopyPatch): PhotoboothCopy {
  if (!patch) return base;
  return {
    qr: { ...base.qr, ...patch.qr },
    capture: { ...base.capture, ...patch.capture },
    result: { ...base.result, ...patch.result },
    aiMode: { ...base.aiMode, ...patch.aiMode },
  };
}



/** Load saved copy; map removed `attract` block into `qr` when present. */

function normalizeCopy(raw: unknown): PhotoboothCopy {

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const legacyAttract =

    o['attract'] && typeof o['attract'] === 'object'

      ? (o['attract'] as Record<string, unknown>)

      : undefined;

  const qrPatch = {

    ...(o['qr'] as Partial<PhotoboothCopy['qr']> | undefined),

  };

  if (legacyAttract) {

    if (typeof legacyAttract['tagline'] === 'string' && !qrPatch.tagline) {

      qrPatch.tagline = legacyAttract['tagline'];

    }

    if (typeof legacyAttract['adminLink'] === 'string' && !qrPatch.adminLink) {

      qrPatch.adminLink = legacyAttract['adminLink'];

    }

  }

  return mergeCopy(PHOTOBOOTH_DEFAULT_COPY, {

    qr: qrPatch,

    capture: o['capture'] as Partial<PhotoboothCopy['capture']> | undefined,

    result: o['result'] as Partial<PhotoboothCopy['result']> | undefined,

    aiMode: o['aiMode'] as Partial<PhotoboothCopy['aiMode']> | undefined,

  });

}



function mergeBranding(patch?: Partial<PhotoboothBranding> | null): PhotoboothBranding {

  const base = PHOTOBOOTH_DEFAULT_BRANDING;

  if (!patch) return base;

  return {

    ...base,

    ...patch,

    logoFile: patch.logoFile === undefined ? base.logoFile : patch.logoFile,

  };

}



function normalizeQrScanMode(raw: unknown): QrScanMode {

  if (raw === 'camera' || raw === 'serial' || raw === 'auto') return raw;

  return PHOTOBOOTH_DEFAULT_SCANNER.qrScanMode;

}



function normalizeScanner(raw: unknown): PhotoboothScannerConfig {

  const d = PHOTOBOOTH_DEFAULT_SCANNER;

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {

    enabled: typeof o['enabled'] === 'boolean' ? o['enabled'] : d.enabled,

    comPort: typeof o['comPort'] === 'string' ? o['comPort'] : d.comPort,

    baudRate: typeof o['baudRate'] === 'number' ? o['baudRate'] : d.baudRate,

    qrScanMode: normalizeQrScanMode(o['qrScanMode']),

    cameraQrFallbackEnabled:

      typeof o['cameraQrFallbackEnabled'] === 'boolean'

        ? o['cameraQrFallbackEnabled']

        : d.cameraQrFallbackEnabled,

  };

}



function normalizeSync(raw: unknown): PhotoboothSyncConfig {

  const d = PHOTOBOOTH_DEFAULT_SYNC;

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {

    apiBaseUrl: typeof o['apiBaseUrl'] === 'string' ? o['apiBaseUrl'] : d.apiBaseUrl,

    validatePath: typeof o['validatePath'] === 'string' ? o['validatePath'] : d.validatePath,

    uploadPath: typeof o['uploadPath'] === 'string' ? o['uploadPath'] : d.uploadPath,

    qrPrefix: typeof o['qrPrefix'] === 'string' ? o['qrPrefix'] : d.qrPrefix,

    boothId: typeof o['boothId'] === 'string' ? o['boothId'] : d.boothId,

  };

}



function normalizeAiModes(raw: unknown): PhotoboothAiMode[] {

  if (!Array.isArray(raw)) return [...PHOTOBOOTH_DEFAULT_AI_MODES];

  const out: PhotoboothAiMode[] = [];

  for (const item of raw) {

    if (!item || typeof item !== 'object') continue;

    const row = item as Record<string, unknown>;

    const id = typeof row['id'] === 'string' ? row['id'].trim() : '';

    const label = typeof row['label'] === 'string' ? row['label'].trim() : '';

    const prompt = typeof row['prompt'] === 'string' ? row['prompt'].trim() : '';

    if (id && label && prompt && id !== PLAIN_PHOTO_MODE_ID) {

      out.push({ id, label, prompt });

    }

  }

  return out.length > 0 ? out : [...PHOTOBOOTH_DEFAULT_AI_MODES];

}



function normalizeConfigPayload(raw: unknown): PhotoboothConfig {

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const { adminPin: _a, openAiApiKey: _k, ...rest } = o;

  const copy = normalizeCopy(rest['copy']);

  let activeRaw = rest['activeThemeId'];

  if (typeof activeRaw === 'string' && activeRaw === 'kia') {

    activeRaw = 'circuit';

  }

  const branding = mergeBranding(

    (rest['branding'] as Partial<PhotoboothBranding> | undefined) ?? undefined,

  );

  const aiGenerationEnabled =

    typeof rest['aiGenerationEnabled'] === 'boolean' ? rest['aiGenerationEnabled'] : false;

  const aiModes = normalizeAiModes(rest['aiModes']);

  const openAiConfigured =

    typeof rest['openAiConfigured'] === 'boolean' ? rest['openAiConfigured'] : false;



  return {

    activeThemeId: typeof activeRaw === 'string' ? activeRaw : 'default',

    branding,

    copy,

    scanner: normalizeScanner(rest['scanner']),

    sync: normalizeSync(rest['sync']),

    aiGenerationEnabled,

    aiModes,

    openAiConfigured,

  };

}



export type BoothAdminSavePartial = Partial<PhotoboothConfig> & { openAiApiKey?: string };



@Injectable({ providedIn: 'root' })

export class BoothConfigService {

  private readonly state = signal<PhotoboothConfig | null>(null);



  readonly config = computed(() => this.state());

  readonly copy = computed(() => this.state()?.copy ?? PHOTOBOOTH_DEFAULT_COPY);

  readonly branding = computed(() => this.state()?.branding ?? PHOTOBOOTH_DEFAULT_BRANDING);

  readonly activeThemeId = computed(() => this.state()?.activeThemeId ?? 'default');

  readonly aiGenerationEnabled = computed(() => this.state()?.aiGenerationEnabled ?? false);

  readonly aiModes = computed(() => this.state()?.aiModes ?? PHOTOBOOTH_DEFAULT_AI_MODES);

  readonly openAiConfigured = computed(() => this.state()?.openAiConfigured ?? false);

  readonly scanner = computed(() => this.state()?.scanner ?? PHOTOBOOTH_DEFAULT_SCANNER);

  readonly sync = computed(() => this.state()?.sync ?? PHOTOBOOTH_DEFAULT_SYNC);



  async load(): Promise<void> {

    if (typeof window !== 'undefined' && window.pbApi?.adminGetConfig) {

      const r = await window.pbApi.adminGetConfig();

      if (r.ok && r.config) {

        this.state.set(normalizeConfigPayload(r.config));

        return;

      }

    }

    const res = await fetch('/config/photobooth-config.default.json');

    if (!res.ok) {

      this.state.set({

        activeThemeId: 'default',

        branding: PHOTOBOOTH_DEFAULT_BRANDING,

        copy: PHOTOBOOTH_DEFAULT_COPY,

        scanner: { ...PHOTOBOOTH_DEFAULT_SCANNER },

        sync: { ...PHOTOBOOTH_DEFAULT_SYNC },

        aiGenerationEnabled: false,

        aiModes: [...PHOTOBOOTH_DEFAULT_AI_MODES],

        openAiConfigured: false,

      });

      return;

    }

    const raw = await res.json();

    this.state.set(normalizeConfigPayload(raw));

  }



  async save(partial: BoothAdminSavePartial): Promise<boolean> {

    if (!window.pbApi?.adminSaveConfig) return false;

    const r = await window.pbApi.adminSaveConfig(partial as Record<string, unknown>);

    if (r.ok && r.config) {

      this.state.set(normalizeConfigPayload(r.config));

      return true;

    }

    return false;

  }

}


