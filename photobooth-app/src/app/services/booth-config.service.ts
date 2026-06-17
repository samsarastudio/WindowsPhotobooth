import { Injectable, computed, signal } from '@angular/core';

import type {

  PhotoboothAiMode,

  PhotoboothConfig,

  PhotoboothBranding,

  PhotoboothCameraConfig,

  PhotoboothCopy,

  PhotoboothScannerConfig,

  PhotoboothSyncConfig,

  PhotoboothKiaApiConfig,

  PhotoboothKiaApiPaths,

  QrScanMode,

} from '../models/photobooth-config.model';

import {

  PLAIN_PHOTO_MODE_ID,

  PHOTOBOOTH_DEFAULT_AI_MODES,

  PHOTOBOOTH_DEFAULT_BRANDING,

  PHOTOBOOTH_DEFAULT_CAMERA,

  PHOTOBOOTH_DEFAULT_COPY,

  PHOTOBOOTH_DEFAULT_KIA_API,

  PHOTOBOOTH_DEFAULT_KIA_API_PATHS,

  PHOTOBOOTH_DEFAULT_SCANNER,

  PHOTOBOOTH_DEFAULT_SYNC,

} from '../models/photobooth-config.model';



type CopyPatch = {
  qr?: Partial<PhotoboothCopy['qr']>;
  capture?: Partial<PhotoboothCopy['capture']>;
  result?: Partial<PhotoboothCopy['result']>;
};

function mergeCopy(base: PhotoboothCopy, patch?: CopyPatch): PhotoboothCopy {
  if (!patch) return base;
  return {
    qr: { ...base.qr, ...patch.qr },
    capture: { ...base.capture, ...patch.capture },
    result: { ...base.result, ...patch.result },
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

  });

}



function mergeBranding(patch?: Partial<PhotoboothBranding> | null): PhotoboothBranding {

  const base = PHOTOBOOTH_DEFAULT_BRANDING;

  if (!patch) return base;

  return {
    ...base,
    ...patch,
    logoFile: patch.logoFile === undefined ? base.logoFile : patch.logoFile,
    logoScalePercent:
      typeof patch.logoScalePercent === 'number' && Number.isFinite(patch.logoScalePercent)
        ? Math.min(200, Math.max(50, Math.round(patch.logoScalePercent)))
        : base.logoScalePercent,
  };

}



function normalizeCamera(raw: unknown): PhotoboothCameraConfig {
  const d = PHOTOBOOTH_DEFAULT_CAMERA;
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const version = o['orientationVersion'];
  const rawOri = o['orientation'];

  if (version === 2 && (rawOri === 'portrait' || rawOri === 'landscape')) {
    return { orientation: rawOri, orientationVersion: 2 };
  }
  if (rawOri === 'portrait') {
    return { orientation: 'portrait', orientationVersion: 2 };
  }
  // Legacy configs (pre Jun 2026): portrait-default = no rotate, landscape = rotate 90°.
  if (rawOri === 'portrait-default') {
    return { orientation: 'landscape', orientationVersion: 2 };
  }
  if (rawOri === 'landscape') {
    return { orientation: 'portrait', orientationVersion: 2 };
  }
  return { orientation: d.orientation, orientationVersion: 2 };
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



function normalizeKiaPaths(raw: unknown): PhotoboothKiaApiPaths {

  const d = PHOTOBOOTH_DEFAULT_KIA_API_PATHS;

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {

    authenticate: typeof o['authenticate'] === 'string' ? o['authenticate'] : d.authenticate,

    validate: typeof o['validate'] === 'string' ? o['validate'] : d.validate,

    frames: typeof o['frames'] === 'string' ? o['frames'] : d.frames,

    media: typeof o['media'] === 'string' ? o['media'] : d.media,

    gallery: typeof o['gallery'] === 'string' ? o['gallery'] : d.gallery,

    qrCode: typeof o['qrCode'] === 'string' ? o['qrCode'] : d.qrCode,

  };

}



/** Merge `kiaApi` with legacy `sync` when upgrading saved configs. */

function normalizeKiaApi(rawKia: unknown, legacySync: PhotoboothSyncConfig): PhotoboothKiaApiConfig {

  const d = PHOTOBOOTH_DEFAULT_KIA_API;

  const o = rawKia && typeof rawKia === 'object' ? (rawKia as Record<string, unknown>) : {};

  let baseUrl = typeof o['baseUrl'] === 'string' ? o['baseUrl'].trim() : '';

  if (!baseUrl && legacySync.apiBaseUrl.trim()) {

    baseUrl = legacySync.apiBaseUrl.trim().replace(/\/$/, '');

  }

  if (!baseUrl) baseUrl = d.baseUrl;
  if (baseUrl.endsWith('/api')) {
    baseUrl = baseUrl.slice(0, -4);
  }

  let uploadBaseUrl = typeof o['uploadBaseUrl'] === 'string' ? o['uploadBaseUrl'].trim() : '';
  if (uploadBaseUrl.endsWith('/api')) {
    uploadBaseUrl = uploadBaseUrl.slice(0, -4);
  }



  const paths = normalizeKiaPaths(o['paths']);

  if (legacySync.validatePath.includes('/kia/photo-booth')) {

    if (legacySync.validatePath) paths.validate = legacySync.validatePath;

    if (legacySync.uploadPath.includes('/kia/')) paths.media = legacySync.uploadPath;

  }



  const qrPrefix =

    typeof o['qrPrefix'] === 'string' && o['qrPrefix'].trim()

      ? o['qrPrefix']

      : legacySync.qrPrefix || d.qrPrefix;



  const bypassCode =
    typeof o['bypassCode'] === 'string' && o['bypassCode'].trim()
      ? o['bypassCode']
      : d.bypassCode;



  return {

    baseUrl,

    uploadBaseUrl,

    bearerToken: typeof o['bearerToken'] === 'string' ? o['bearerToken'] : d.bearerToken,

    qrPrefix,

    bypassCode,

    devBypassEmail:
      typeof o['devBypassEmail'] === 'string' && o['devBypassEmail'].trim()
        ? o['devBypassEmail'].trim()
        : d.devBypassEmail,

    offlineAllowPrefix:

      typeof o['offlineAllowPrefix'] === 'boolean' ? o['offlineAllowPrefix'] : d.offlineAllowPrefix,

    debugMode: o['debugMode'] === true,

    uploadImageFormat:
      o['uploadImageFormat'] === 'jpeg' || o['uploadImageFormat'] === 'jpg' ? 'jpeg' : 'png',

    paths,

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

  const bearerConfigured =

    typeof rest['bearerConfigured'] === 'boolean' ? rest['bearerConfigured'] : false;

  const sync = normalizeSync(rest['sync']);

  const kiaApi = normalizeKiaApi(rest['kiaApi'], sync);



  return {

    activeThemeId: typeof activeRaw === 'string' ? activeRaw : 'default',

    branding,

    copy,

    camera: normalizeCamera(rest['camera']),

    scanner: normalizeScanner(rest['scanner']),

    sync,

    kiaApi,

    aiGenerationEnabled,

    aiModes,

    openAiConfigured,

    bearerConfigured,

  };

}



export type BoothAdminSavePartial = Partial<Omit<PhotoboothConfig, 'branding' | 'camera'>> & {
  branding?: Partial<PhotoboothBranding>;
  camera?: Partial<PhotoboothCameraConfig>;
  openAiApiKey?: string;
};



@Injectable({ providedIn: 'root' })

export class BoothConfigService {

  private readonly state = signal<PhotoboothConfig | null>(null);



  readonly config = computed(() => this.state());

  readonly copy = computed(() => this.state()?.copy ?? PHOTOBOOTH_DEFAULT_COPY);

  readonly branding = computed(() => this.state()?.branding ?? PHOTOBOOTH_DEFAULT_BRANDING);

  readonly camera = computed(() => this.state()?.camera ?? PHOTOBOOTH_DEFAULT_CAMERA);

  readonly activeThemeId = computed(() => this.state()?.activeThemeId ?? 'default');

  readonly aiGenerationEnabled = computed(() => this.state()?.aiGenerationEnabled ?? false);

  readonly aiModes = computed(() => this.state()?.aiModes ?? PHOTOBOOTH_DEFAULT_AI_MODES);

  readonly openAiConfigured = computed(() => this.state()?.openAiConfigured ?? false);

  readonly scanner = computed(() => this.state()?.scanner ?? PHOTOBOOTH_DEFAULT_SCANNER);

  readonly sync = computed(() => this.state()?.sync ?? PHOTOBOOTH_DEFAULT_SYNC);

  readonly kiaApi = computed(() => this.state()?.kiaApi ?? PHOTOBOOTH_DEFAULT_KIA_API);



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

        camera: { ...PHOTOBOOTH_DEFAULT_CAMERA },

        scanner: { ...PHOTOBOOTH_DEFAULT_SCANNER },

        sync: { ...PHOTOBOOTH_DEFAULT_SYNC },

        kiaApi: { ...PHOTOBOOTH_DEFAULT_KIA_API, paths: { ...PHOTOBOOTH_DEFAULT_KIA_API_PATHS } },

        aiGenerationEnabled: false,

        aiModes: [...PHOTOBOOTH_DEFAULT_AI_MODES],

        openAiConfigured: false,

        bearerConfigured: false,

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


