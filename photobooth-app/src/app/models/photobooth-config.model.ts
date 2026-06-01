export interface PhotoboothBranding {
  /** Filename under `config/branding/` (e.g. `booth-logo.png`), or null for emoji icons. */
  logoFile: string | null;
}

/** QR scan landing (first screen). */
export interface PhotoboothCopyQr {
  icon: string;
  tagline: string;
  title: string;
  subtitle: string;
  scanSuccess: string;
  scanPrompt: string;
  scanning: string;
  cameraTapHint: string;
  invalidCode: string;
  bypassCode: string;
  adminLink: string;
}

export interface PhotoboothCopyCapture {
  starting: string;
  readyTitle: string;
  readySubtitle: string;
  footerHint: string;
}

export interface PhotoboothCopyResult {
  title: string;
  subtitle: string;
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
  enabled: true,
  comPort: '',
  baudRate: 9600,
  qrScanMode: 'serial',
  cameraQrFallbackEnabled: false,
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
  qr: {
    icon: '🔐',
    tagline: 'Movement that inspires',
    title: 'Capture Your KIA Moment',
    subtitle: 'Personalized keepsake experience.',
    scanSuccess: 'QR verified',
    scanPrompt: 'Scan your QR code to get started',
    scanning: 'Scanning…',
    cameraTapHint: 'Tap the QR area to use the booth camera',
    invalidCode: 'Invalid QR code. Please use your registration code.',
    bypassCode: '1234',
    adminLink: 'Admin',
  },
  capture: {
    starting: 'Starting camera…',
    readyTitle: 'Get Ready',
    readySubtitle: 'Strike Your Best Pose',
    footerHint: 'Look at camera and hold still.',
  },
  result: {
    title: 'Your KIA Keepsake is Ready',
    subtitle: 'Download your photo.',
    loading: 'Loading…',
    savedPrefix: 'Saved:',
    retake: 'Start Again',
    submit: 'Upload to Hub',
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
