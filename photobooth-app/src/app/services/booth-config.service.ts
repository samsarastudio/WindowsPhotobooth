import { Injectable, computed, signal } from '@angular/core';
import type {
  PhotoboothAiMode,
  PhotoboothCameraConfig,
  PhotoboothConfig,
  PhotoboothBranding,
  PhotoboothCopy,
  PhotoboothDebugConfig,
  PhotoboothGalleryConfig,
  PhotoboothPhotoFramesConfig,
  PhotoboothPhysicalFrameConfig,
  PhotoboothGuestModesConfig,
  PhotoboothBoothModeId,
  PhotoboothPrintConfig,
} from '../models/photobooth-config.model';
import {
  PLAIN_PHOTO_MODE_ID,
  PHOTOBOOTH_DEFAULT_AI_MODES,
  PHOTOBOOTH_DEFAULT_BRANDING,
  PHOTOBOOTH_DEFAULT_CAMERA,
  PHOTOBOOTH_DEFAULT_COPY,
  PHOTOBOOTH_DEFAULT_DEBUG,
  PHOTOBOOTH_DEFAULT_GALLERY,
  PHOTOBOOTH_DEFAULT_GUEST_MODES,
  PHOTOBOOTH_DEFAULT_PHOTO_FRAMES,
  PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME,
  PHOTOBOOTH_DEFAULT_PRINT,
} from '../models/photobooth-config.model';

function mergeCopy(base: PhotoboothCopy, patch?: Partial<PhotoboothCopy>): PhotoboothCopy {
  if (!patch) return structuredClone(base);
  return {
    attract: { ...base.attract, ...patch.attract },
    qr: { ...base.qr, ...patch.qr },
    capture: { ...base.capture, ...patch.capture },
    result: { ...base.result, ...patch.result },
    aiMode: { ...base.aiMode, ...patch.aiMode },
    boothMode: { ...base.boothMode, ...patch.boothMode },
    frame: { ...base.frame, ...patch.frame },
    caption: { ...base.caption, ...patch.caption },
  };
}

function normalizeScale(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(1.6, Math.max(0.6, value));
}

/** Older booth saves used generic attract copy — upgrade to Kia ref defaults unless clearly customized. */
function upgradeLegacyAttractCopy(attract: PhotoboothCopy['attract']): PhotoboothCopy['attract'] {
  const d = PHOTOBOOTH_DEFAULT_COPY.attract;
  const sub = attract.subtitle?.trim().toLowerCase() ?? '';
  const title = attract.title?.trim().toLowerCase() ?? '';
  const legacy =
    sub === 'touch anywhere to begin' ||
    (title === 'photobooth' && sub.includes('touch anywhere'));
  if (!legacy) return attract;
  return {
    ...d,
    icon: attract.icon?.trim() ? attract.icon : d.icon,
    adminLink: attract.adminLink?.trim() ? attract.adminLink : d.adminLink,
  };
}

function normalizeAttractControls(attract: PhotoboothCopy['attract']): PhotoboothCopy['attract'] {
  const d = PHOTOBOOTH_DEFAULT_COPY.attract;
  return {
    ...attract,
    mainScale: normalizeScale(attract.mainScale, d.mainScale),
    topScale: normalizeScale(attract.topScale, d.topScale),
  };
}

function mergeBranding(patch?: Partial<PhotoboothBranding> | null): PhotoboothBranding {
  const base = PHOTOBOOTH_DEFAULT_BRANDING;
  if (!patch) return base;
  const brandNameRaw = patch.brandName;
  const brandName =
    brandNameRaw === null || brandNameRaw === undefined
      ? base.brandName
      : typeof brandNameRaw === 'string'
        ? brandNameRaw.trim() || null
        : base.brandName;
  return {
    ...base,
    ...patch,
    logoFile: patch.logoFile === undefined ? base.logoFile : patch.logoFile,
    aiLogoFile: patch.aiLogoFile === undefined ? base.aiLogoFile : patch.aiLogoFile,
    brandName,
    applyBrandToAi: typeof patch.applyBrandToAi === 'boolean' ? patch.applyBrandToAi : base.applyBrandToAi,
  };
}

function normalizeAiModes(raw: unknown): PhotoboothAiMode[] {
  if (!Array.isArray(raw)) return [...PHOTOBOOTH_DEFAULT_AI_MODES];
  const out: PhotoboothAiMode[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = typeof o['id'] === 'string' ? o['id'].trim() : '';
    const label = typeof o['label'] === 'string' ? o['label'].trim() : '';
    const prompt = typeof o['prompt'] === 'string' ? o['prompt'].trim() : '';
    const useInpainting = o['useInpainting'] === true;
    const randomizeBackground =
      o['randomizeBackground'] === false ? false : useInpainting ? true : o['randomizeBackground'] === true;
    const inpaintRaw = typeof o['inpaintPrompt'] === 'string' ? o['inpaintPrompt'].trim() : '';
    if (id && label && prompt && id !== PLAIN_PHOTO_MODE_ID) {
      out.push({
        id,
        label,
        prompt,
        ...(useInpainting ? { useInpainting: true, randomizeBackground } : {}),
        ...(inpaintRaw ? { inpaintPrompt: inpaintRaw } : {}),
      });
    }
  }
  return out.length > 0 ? out : [...PHOTOBOOTH_DEFAULT_AI_MODES];
}

function normalizeDefaultAiModeId(raw: unknown, aiModes: PhotoboothAiMode[]): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id) return null;
  if (id === PLAIN_PHOTO_MODE_ID) return PLAIN_PHOTO_MODE_ID;
  return aiModes.some((m) => m.id === id) ? id : null;
}

function normalizeCameraConfig(patch?: Partial<PhotoboothCameraConfig> | null): PhotoboothCameraConfig {
  const base = PHOTOBOOTH_DEFAULT_CAMERA;
  if (!patch) return { ...base };
  const sourceRaw = patch.source;
  const source =
    sourceRaw === 'sdk' || sourceRaw === 'webcam' || sourceRaw === 'auto' ? sourceRaw : base.source;
  let sdkCameraIndex =
    typeof patch.sdkCameraIndex === 'number' && Number.isFinite(patch.sdkCameraIndex)
      ? Math.max(0, Math.floor(patch.sdkCameraIndex))
      : base.sdkCameraIndex;
  const webcamRaw = patch.webcamDeviceId;
  const webcamDeviceId =
    webcamRaw === null || webcamRaw === undefined
      ? base.webcamDeviceId
      : typeof webcamRaw === 'string' && webcamRaw.trim()
        ? webcamRaw.trim()
        : null;
  return { source, sdkCameraIndex, webcamDeviceId };
}

function normalizePhotoFramesConfig(
  patch?: Partial<PhotoboothPhotoFramesConfig> | null,
): PhotoboothPhotoFramesConfig {
  const base = PHOTOBOOTH_DEFAULT_PHOTO_FRAMES;
  if (!patch) return { ...base, guestFrameFiles: [...base.guestFrameFiles] };
  let photoScale =
    typeof patch.photoScale === 'number' && !Number.isNaN(patch.photoScale)
      ? patch.photoScale
      : base.photoScale;
  photoScale = Math.min(1, Math.max(0.5, photoScale));
  let defaultFrameFile =
    typeof patch.defaultFrameFile === 'string' && patch.defaultFrameFile.trim()
      ? pathBasenameSafe(patch.defaultFrameFile.trim())
      : patch.defaultFrameFile === null
        ? null
        : base.defaultFrameFile;
  let guestFrameFiles: string[] = [...base.guestFrameFiles];
  if (Array.isArray(patch.guestFrameFiles)) {
    guestFrameFiles = patch.guestFrameFiles
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => pathBasenameSafe(x.trim()));
    if (patch.guestFrameFiles.includes('__none__')) {
      guestFrameFiles = ['__none__'];
    }
  }
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
    photoScale,
    defaultFrameFile,
    guestFrameFiles,
    autoApplyFrame: typeof patch.autoApplyFrame === 'boolean' ? patch.autoApplyFrame : base.autoApplyFrame,
    guestTextEnabled:
      typeof patch.guestTextEnabled === 'boolean' ? patch.guestTextEnabled : base.guestTextEnabled,
    guestTextOptional:
      typeof patch.guestTextOptional === 'boolean' ? patch.guestTextOptional : base.guestTextOptional,
    guestTextMaxLength: Math.min(
      80,
      Math.max(
        8,
        typeof patch.guestTextMaxLength === 'number' && !Number.isNaN(patch.guestTextMaxLength)
          ? Math.floor(patch.guestTextMaxLength)
          : base.guestTextMaxLength,
      ),
    ),
    guestTextCreditLine:
      typeof patch.guestTextCreditLine === 'string'
        ? patch.guestTextCreditLine.trim().slice(0, 60)
        : base.guestTextCreditLine,
    guestTextXPercent: clampPercent(
      patch.guestTextXPercent,
      base.guestTextXPercent,
    ),
    guestTextYPercent: clampPercent(
      patch.guestTextYPercent,
      base.guestTextYPercent,
    ),
    guestTextSizePercent: clampRange(
      patch.guestTextSizePercent,
      1.2,
      12,
      base.guestTextSizePercent,
    ),
    guestTextColor: parseHexColor(patch.guestTextColor, base.guestTextColor),
    guestTextCreditColor: parseHexColor(patch.guestTextCreditColor, base.guestTextCreditColor),
    guestTextAlign:
      patch.guestTextAlign === 'left' ||
      patch.guestTextAlign === 'center' ||
      patch.guestTextAlign === 'right'
        ? patch.guestTextAlign
        : base.guestTextAlign,
    guestTextBrush:
      typeof patch.guestTextBrush === 'boolean' ? patch.guestTextBrush : base.guestTextBrush,
    guestTextBrushOpacity: clampRange(
      patch.guestTextBrushOpacity,
      0,
      1,
      base.guestTextBrushOpacity,
    ),
  };
}

function clampPercent(value: unknown, fallback: number): number {
  return clampRange(value, 0, 100, fallback);
}

function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return fallback;
}

function normalizeGalleryConfig(
  patch?: Partial<PhotoboothGalleryConfig> | null,
): PhotoboothGalleryConfig {
  const base = PHOTOBOOTH_DEFAULT_GALLERY;
  if (!patch) return { ...base };
  const apiBaseUrl =
    typeof patch.apiBaseUrl === 'string' && patch.apiBaseUrl.trim()
      ? patch.apiBaseUrl.trim().replace(/\/$/, '')
      : base.apiBaseUrl;
  const sessionPrefix =
    typeof patch.sessionPrefix === 'string' && patch.sessionPrefix.trim()
      ? patch.sessionPrefix
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || base.sessionPrefix
      : base.sessionPrefix;
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
    apiBaseUrl,
    uploadToken: typeof patch.uploadToken === 'string' ? patch.uploadToken : base.uploadToken,
    sessionPrefix,
    uploadOriginal:
      typeof patch.uploadOriginal === 'boolean' ? patch.uploadOriginal : base.uploadOriginal,
    uploadFramed: typeof patch.uploadFramed === 'boolean' ? patch.uploadFramed : base.uploadFramed,
    uploadAi: typeof patch.uploadAi === 'boolean' ? patch.uploadAi : base.uploadAi,
  };
}

function normalizeGuestModesConfig(
  patch?: Partial<PhotoboothGuestModesConfig> | null,
  legacyBoothMode?: unknown,
): PhotoboothGuestModesConfig {
  const base = PHOTOBOOTH_DEFAULT_GUEST_MODES;
  if (patch && typeof patch === 'object') {
    const def =
      typeof patch.defaultEnabled === 'boolean' ? patch.defaultEnabled : base.defaultEnabled;
    const phys =
      typeof patch.physicalFrameEnabled === 'boolean'
        ? patch.physicalFrameEnabled
        : base.physicalFrameEnabled;
    // At least one mode must stay on.
    if (!def && !phys) return { ...base };
    return { defaultEnabled: def, physicalFrameEnabled: phys };
  }
  // Migrate exclusive admin boothMode → guest offer flags.
  if (legacyBoothMode === 'physicalFrame') {
    return { defaultEnabled: false, physicalFrameEnabled: true };
  }
  // Prior "default-only" admin setting → offer both so guests can choose.
  return { ...base };
}

/** Legacy inch keys from configs saved before cm/mm migration. */
function migratePhysicalFramePatch(
  patch: Partial<PhotoboothPhysicalFrameConfig> & Record<string, unknown>,
): Partial<PhotoboothPhysicalFrameConfig> {
  const legacy = patch as Record<string, unknown>;
  const out: Partial<PhotoboothPhysicalFrameConfig> = { ...patch };
  if (out.cellWidthCm == null && legacy['cellWidthIn'] != null) {
    out.cellWidthCm = Number(legacy['cellWidthIn']) * 2.54;
  }
  if (out.cellHeightCm == null && legacy['cellHeightIn'] != null) {
    out.cellHeightCm = Number(legacy['cellHeightIn']) * 2.54;
  }
  if (out.gapMm == null && legacy['gapIn'] != null) {
    out.gapMm = Number(legacy['gapIn']) * 25.4;
  }
  if (out.marginMm == null && legacy['marginIn'] != null) {
    out.marginMm = Number(legacy['marginIn']) * 25.4;
  }
  if (out.innerPaddingMm == null) {
    out.innerPaddingMm = PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME.innerPaddingMm;
  }
  if (out.borderEnabled == null) {
    out.borderEnabled = PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME.borderEnabled;
  }
  return out;
}

function normalizePhysicalFrameConfig(
  patch?: Partial<PhotoboothPhysicalFrameConfig> | null,
): PhotoboothPhysicalFrameConfig {
  const base = PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME;
  if (!patch) return { ...base };
  const p = migratePhysicalFramePatch(patch as Partial<PhotoboothPhysicalFrameConfig> & Record<string, unknown>);
  const rot = Number(p.rotateDegrees);
  return {
    cellWidthCm: clampRange(p.cellWidthCm, 3, 12, base.cellWidthCm),
    cellHeightCm: clampRange(p.cellHeightCm, 4, 15, base.cellHeightCm),
    innerPaddingMm: clampRange(p.innerPaddingMm, 0, 12, base.innerPaddingMm),
    gapMm: clampRange(p.gapMm, 0, 15, base.gapMm),
    marginMm: clampRange(p.marginMm, 0, 15, base.marginMm),
    dpi: Math.round(clampRange(p.dpi, 72, 600, base.dpi)),
    rotateDegrees: rot === -90 ? -90 : 90,
    borderEnabled: typeof p.borderEnabled === 'boolean' ? p.borderEnabled : base.borderEnabled,
  };
}

function normalizePrintConfig(
  patch?: Partial<PhotoboothPrintConfig> | null,
): PhotoboothPrintConfig {
  const base = PHOTOBOOTH_DEFAULT_PRINT;
  if (!patch) return { ...base };
  const nameRaw = patch.printerName;
  const printerName =
    nameRaw === null || nameRaw === undefined
      ? base.printerName
      : typeof nameRaw === 'string' && nameRaw.trim()
        ? nameRaw.trim()
        : null;
  let bleedScale =
    typeof patch.bleedScale === 'number' && Number.isFinite(patch.bleedScale)
      ? patch.bleedScale
      : Number.isFinite(Number(patch.bleedScale))
        ? Number(patch.bleedScale)
        : base.bleedScale;
  bleedScale = Math.min(1.12, Math.max(1.0, bleedScale));
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
    printerName,
    bleedScale,
  };
}

function normalizeDebugConfig(
  patch?: Partial<PhotoboothDebugConfig> | null,
): PhotoboothDebugConfig {
  const base = PHOTOBOOTH_DEFAULT_DEBUG;
  if (!patch) return { ...base };
  return {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : base.enabled,
  };
}

function pathBasenameSafe(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() || name;
  if (base.includes('..')) return 'frame.png';
  return base;
}

function normalizeConfigPayload(raw: unknown): PhotoboothConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const { adminPin: _a, openAiApiKey: _k, ...rest } = o;
  let copy = mergeCopy(
    PHOTOBOOTH_DEFAULT_COPY,
    (rest['copy'] as Partial<PhotoboothCopy> | undefined) ?? undefined,
  );
  copy = { ...copy, attract: upgradeLegacyAttractCopy(copy.attract) };
  copy = { ...copy, attract: normalizeAttractControls(copy.attract) };
  let activeRaw = rest['activeThemeId'];
  if (typeof activeRaw === 'string' && activeRaw === 'kia') {
    activeRaw = 'circuit';
  }
  const branding = mergeBranding(
    (rest['branding'] as Partial<PhotoboothBranding> | undefined) ?? undefined,
  );
  const camera = normalizeCameraConfig(
    (rest['camera'] as Partial<PhotoboothCameraConfig> | undefined) ?? undefined,
  );
  const photoFrames = normalizePhotoFramesConfig(
    (rest['photoFrames'] as Partial<PhotoboothPhotoFramesConfig> | undefined) ?? undefined,
  );
  const gallery = normalizeGalleryConfig(
    (rest['gallery'] as Partial<PhotoboothGalleryConfig> | undefined) ?? undefined,
  );
  const print = normalizePrintConfig(
    (rest['print'] as Partial<PhotoboothPrintConfig> | undefined) ?? undefined,
  );
  const debug = normalizeDebugConfig(
    (rest['debug'] as Partial<PhotoboothDebugConfig> | undefined) ?? undefined,
  );
  const boothModeLegacy = rest['boothMode'];
  const guestModes = normalizeGuestModesConfig(
    (rest['guestModes'] as Partial<PhotoboothGuestModesConfig> | undefined) ?? undefined,
    boothModeLegacy,
  );
  const physicalFrame = normalizePhysicalFrameConfig(
    (rest['physicalFrame'] as Partial<PhotoboothPhysicalFrameConfig> | undefined) ?? undefined,
  );
  const requireQrUnlock =
    typeof rest['requireQrUnlock'] === 'boolean' ? rest['requireQrUnlock'] : false;
  const aiGenerationEnabled =
    typeof rest['aiGenerationEnabled'] === 'boolean' ? rest['aiGenerationEnabled'] : false;
  const aiModes = normalizeAiModes(rest['aiModes']);
  const defaultAiModeId = normalizeDefaultAiModeId(rest['defaultAiModeId'], aiModes);
  const openAiConfigured =
    typeof rest['openAiConfigured'] === 'boolean' ? rest['openAiConfigured'] : false;

  return {
    activeThemeId: typeof activeRaw === 'string' ? activeRaw : 'inmoment',
    branding,
    camera,
    photoFrames,
    gallery,
    print,
    debug,
    copy,
    guestModes,
    physicalFrame,
    requireQrUnlock,
    aiGenerationEnabled,
    defaultAiModeId,
    aiModes,
    openAiConfigured,
  };
}

export type BoothAdminSavePartial = Partial<
  Omit<
    PhotoboothConfig,
    | 'branding'
    | 'camera'
    | 'photoFrames'
    | 'gallery'
    | 'print'
    | 'debug'
    | 'physicalFrame'
    | 'guestModes'
  >
> & {
  openAiApiKey?: string;
  branding?: Partial<PhotoboothBranding>;
  camera?: Partial<PhotoboothCameraConfig>;
  photoFrames?: Partial<PhotoboothPhotoFramesConfig>;
  gallery?: Partial<PhotoboothGalleryConfig>;
  print?: Partial<PhotoboothPrintConfig>;
  debug?: Partial<PhotoboothDebugConfig>;
  physicalFrame?: Partial<PhotoboothPhysicalFrameConfig>;
  guestModes?: Partial<PhotoboothGuestModesConfig>;
};

@Injectable({ providedIn: 'root' })
export class BoothConfigService {
  private readonly state = signal<PhotoboothConfig | null>(null);

  readonly config = computed(() => this.state());
  readonly copy = computed(() => this.state()?.copy ?? PHOTOBOOTH_DEFAULT_COPY);
  readonly branding = computed(() => this.state()?.branding ?? PHOTOBOOTH_DEFAULT_BRANDING);
  readonly camera = computed(() => this.state()?.camera ?? PHOTOBOOTH_DEFAULT_CAMERA);
  readonly photoFrames = computed(
    () => this.state()?.photoFrames ?? PHOTOBOOTH_DEFAULT_PHOTO_FRAMES,
  );
  readonly gallery = computed(() => this.state()?.gallery ?? PHOTOBOOTH_DEFAULT_GALLERY);
  readonly print = computed(() => this.state()?.print ?? PHOTOBOOTH_DEFAULT_PRINT);
  readonly debug = computed(() => this.state()?.debug ?? PHOTOBOOTH_DEFAULT_DEBUG);
  readonly debugEnabled = computed(() => this.debug().enabled === true);
  readonly guestModes = computed(
    () => this.state()?.guestModes ?? PHOTOBOOTH_DEFAULT_GUEST_MODES,
  );
  readonly physicalFrame = computed(
    () => this.state()?.physicalFrame ?? PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME,
  );
  /** Modes the guest may pick (order: default, then physical). */
  readonly offeredBoothModes = computed((): PhotoboothBoothModeId[] => {
    const g = this.guestModes();
    const out: PhotoboothBoothModeId[] = [];
    if (g.defaultEnabled) out.push('default');
    if (g.physicalFrameEnabled) out.push('physicalFrame');
    return out.length ? out : (['default'] as PhotoboothBoothModeId[]);
  });
  readonly shouldShowBoothModeStep = computed(() => this.offeredBoothModes().length > 1);
  readonly requireQrUnlock = computed(() => this.state()?.requireQrUnlock ?? false);
  readonly activeThemeId = computed(() => this.state()?.activeThemeId ?? 'inmoment');
  readonly aiGenerationEnabled = computed(() => this.state()?.aiGenerationEnabled ?? false);
  readonly defaultAiModeId = computed(() => this.state()?.defaultAiModeId ?? null);
  /** Resolved default mode when configured; null means guest picks on the style screen. */
  readonly fixedAiModeId = computed(() => {
    const id = this.defaultAiModeId();
    if (!id) return null;
    if (id === PLAIN_PHOTO_MODE_ID) return PLAIN_PHOTO_MODE_ID;
    return this.aiModes().some((m) => m.id === id) ? id : null;
  });
  readonly skipAiModeSelection = computed(() => this.fixedAiModeId() !== null);
  /**
   * AI style step only for digital (default) sessions — physical-frame skips it.
   * Callers should also check BoothModeService.isPhysicalFrameMode for the live session.
   */
  readonly shouldShowAiModeStep = computed(
    () =>
      this.aiGenerationEnabled() &&
      !this.skipAiModeSelection() &&
      this.aiModes().length > 0,
  );
  readonly aiModes = computed(() => this.state()?.aiModes ?? PHOTOBOOTH_DEFAULT_AI_MODES);
  readonly openAiConfigured = computed(() => this.state()?.openAiConfigured ?? false);

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
        activeThemeId: 'inmoment',
        branding: PHOTOBOOTH_DEFAULT_BRANDING,
        camera: { ...PHOTOBOOTH_DEFAULT_CAMERA },
        photoFrames: { ...PHOTOBOOTH_DEFAULT_PHOTO_FRAMES },
        gallery: { ...PHOTOBOOTH_DEFAULT_GALLERY },
        print: { ...PHOTOBOOTH_DEFAULT_PRINT },
        debug: { ...PHOTOBOOTH_DEFAULT_DEBUG },
        copy: PHOTOBOOTH_DEFAULT_COPY,
        guestModes: { ...PHOTOBOOTH_DEFAULT_GUEST_MODES },
        physicalFrame: { ...PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME },
        requireQrUnlock: false,
        aiGenerationEnabled: false,
        defaultAiModeId: null,
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
