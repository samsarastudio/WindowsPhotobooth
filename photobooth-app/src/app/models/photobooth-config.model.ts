export interface PhotoboothBranding {
  /** Filename under `config/branding/` (e.g. `booth-logo.png`), or null for emoji icons. */
  logoFile: string | null;
}

export interface PhotoboothCopyAttract {
  icon: string;
  /** Brand line under logo (e.g. tagline). */
  tagline: string;
  /** Scale multiplier for main attract text block (title + subtitle). */
  mainScale: number;
  /** Scale multiplier for top brand block (logo + tagline). */
  topScale: number;
  title: string;
  subtitle: string;
  /** Primary CTA label (e.g. Tap to Start). */
  ctaLabel: string;
  startAria: string;
  adminLink: string;
}

export interface PhotoboothCopyQr {
  icon: string;
  title: string;
  subtitle: string;
  /** Shown briefly after a valid scan / unlock code (keyboard flow). */
  scanSuccess: string;
  /** Small footer line under primary actions. */
  footer: string;
  codeLabel: string;
  ok: string;
  back: string;
  invalidCode: string;
  debugHint: string;
  bypassCode: string;
}

export interface PhotoboothCopyCapture {
  /** Legacy / admin — optional secondary heading when not using ready flow. */
  sideTitle: string;
  instructions: string;
  starting: string;
  /** Main heading on capture (e.g. Get Ready). */
  readyTitle: string;
  /** Lead line under heading (e.g. center yourself…). */
  readySubtitle: string;
  /** Line below the preview stage (e.g. hold still). */
  footerHint: string;
  /** Small line under countdown (e.g. Smile — capturing soon). */
  smileHint: string;
}

export interface PhotoboothCopyResult {
  title: string;
  loading: string;
  savedPrefix: string;
  retake: string;
  submit: string;
  /** Button to run OpenAI image generation */
  generateAi: string;
  generatingAi: string;
  aiPreviewTitle: string;
  aiErrorPrefix: string;
  /** Gallery page (paired original + AI) */
  aiGalleryTitle: string;
  galleryThumbOriginal: string;
  galleryThumbAi: string;
  galleryBackToResult: string;
  galleryFinish: string;
  /** Expandable panel during generation — not live model “reasoning”; staged status only. */
  thinkingSummary: string;
  thinkingStepAnalyze: string;
  thinkingStepPlan: string;
  thinkingStepImage: string;
  thinkingFootnote: string;
}

export interface PhotoboothCopyAiMode {
  title: string;
  subtitle: string;
  back: string;
  /**
   * Label for the non-AI option (regular booth photo only).
   * Use "Photocapture", "Default", etc. — not an admin `aiModes` row.
   */
  plainPhotoLabel: string;
}

/**
 * Reserved `AiStyleService` mode id: skip AI on the result screen; standard capture only.
 * Not stored in `aiModes[]` — the plain button is always shown when the AI step is enabled.
 */
export const PLAIN_PHOTO_MODE_ID = 'photocapture';

export interface PhotoboothCopy {
  attract: PhotoboothCopyAttract;
  qr: PhotoboothCopyQr;
  capture: PhotoboothCopyCapture;
  result: PhotoboothCopyResult;
  aiMode: PhotoboothCopyAiMode;
}

export interface PhotoboothAiMode {
  id: string;
  label: string;
  prompt: string;
}

/** How the booth reads registration QR codes. */
export type QrScanMode = 'serial' | 'camera' | 'auto';

/** Datalogic GFS4400 USB-COM scanner (presentation / object sense). */
export interface PhotoboothScannerConfig {
  enabled: boolean;
  comPort: string;
  baudRate: number;
  qrScanMode: QrScanMode;
  cameraQrFallbackEnabled: boolean;
}

/** Backend token validation and photo upload. */
export interface PhotoboothSyncConfig {
  apiBaseUrl: string;
  validatePath: string;
  uploadPath: string;
  qrPrefix: string;
  boothId: string;
}

export const PHOTOBOOTH_DEFAULT_SCANNER: PhotoboothScannerConfig = {
  enabled: false,
  comPort: '',
  baudRate: 9600,
  qrScanMode: 'auto',
  cameraQrFallbackEnabled: true,
};

export const PHOTOBOOTH_DEFAULT_SYNC: PhotoboothSyncConfig = {
  apiBaseUrl: '',
  validatePath: '/api/photobooth/validate-token',
  uploadPath: '/api/photobooth/upload',
  qrPrefix: 'KIA-PHOTO-',
  boothId: '',
};

/** Exact prompt for the default Newspaper style (admin may duplicate or edit in JSON). */
export const NEWSPAPER_AI_PROMPT =
  'Create a newspaper cutting style front page with the main title exactly: HAPPENING NOW! Transform the person in the uploaded photo into a whimsical black-and-white vintage newspaper front page. Place them as the main portrait in the center, styled like an old engraved photograph. Preserve the overall scene framing from the source image (whole room/context), not a tighter zoom—only use a close portrait crop if the source is already cropped that way. Surround them with bold, exaggerated headline text, narrow newspaper columns, and playful subheadings. Use high-contrast black ink on pure white background, subtle paper texture, and classic serif fonts. Add quirky, magical or humorous headlines to create a charming, slightly surreal tone. Keep the layout dense, editorial, and reminiscent of an old fantasy newspaper. Ensure the subject\'s face remains recognizable but stylized to match the printed newspaper aesthetic.';

/** Fields returned to the renderer (admin PIN and OpenAI API key are never included). */
export interface PhotoboothConfig {
  activeThemeId: string;
  branding: PhotoboothBranding;
  copy: PhotoboothCopy;
  scanner: PhotoboothScannerConfig;
  sync: PhotoboothSyncConfig;
  /** When true, after QR the guest picks an AI style before capture. */
  aiGenerationEnabled: boolean;
  /** Modes shown after QR; each carries the prompt sent to the Images API. */
  aiModes: PhotoboothAiMode[];
  /** Set only by Electron after merging config; true when `openAiApiKey` exists on disk. */
  openAiConfigured?: boolean;
}

export const PHOTOBOOTH_DEFAULT_BRANDING: PhotoboothBranding = {
  logoFile: null,
};

export const PHOTOBOOTH_DEFAULT_AI_MODES: PhotoboothAiMode[] = [
  {
    id: 'newspaper',
    label: 'Newspaper',
    prompt: NEWSPAPER_AI_PROMPT,
  },
];

export const PHOTOBOOTH_DEFAULT_COPY: PhotoboothCopy = {
  attract: {
    icon: '📷',
    tagline: 'Movement that inspires',
    mainScale: 1,
    topScale: 1,
    title: 'Your Moment Starts Here',
    subtitle: 'Tap to create your\npersonalized photo keepsake.',
    ctaLabel: 'Tap to Start',
    startAria: 'Tap to Start',
    adminLink: 'Admin',
  },
  qr: {
    icon: '🔐',
    title: 'Scan your QR',
    subtitle:
      'Hold your phone to the photobooth scanner to begin your photo experience.',
    scanSuccess: 'QR verified',
    footer: 'Have your registration QR ready.',
    codeLabel: 'Code',
    ok: 'OK',
    back: 'Back',
    invalidCode: 'Invalid code. Use 1234 to continue (debug).',
    debugHint: 'Debug — type ok then Enter',
    bypassCode: '1234',
  },
  capture: {
    sideTitle: 'How to pose',
    instructions:
      'Stand in the frame · Face the camera · Leave a little space above your head · Smile when the countdown ends',
    starting: 'Starting camera…',
    readyTitle: 'Get Ready',
    readySubtitle: 'Center yourself in the frame. Your photo begins in…',
    footerHint: 'Look at the camera and hold still.',
    smileHint: 'Smile — capturing soon',
  },
  result: {
    title: 'Your photo',
    loading: 'Loading…',
    savedPrefix: 'Saved:',
    retake: 'Retake',
    submit: 'Submit',
    generateAi: 'Create AI version',
    generatingAi: 'Creating your AI image…',
    aiPreviewTitle: 'AI version',
    aiErrorPrefix: 'AI generation failed:',
    aiGalleryTitle: 'Your photos',
    galleryThumbOriginal: 'Original',
    galleryThumbAi: 'AI style',
    galleryBackToResult: 'Back to photo',
    galleryFinish: 'Finish',
    thinkingSummary: 'Preparing your image',
    thinkingStepAnalyze: 'Analysing framing and composition',
    thinkingStepPlan: 'Applying your chosen style directions',
    thinkingStepImage: 'Rendering with the image API',
    thinkingFootnote:
      'Runs on OpenAI Images (edit). Unlike ChatGPT, the booth cannot stream GPT‑5 “thinking” text for image jobs.',
  },
  aiMode: {
    title: 'Choose a style',
    subtitle: 'Pick how we transform your photo',
    back: 'Back',
    plainPhotoLabel: 'Photocapture',
  },
};
