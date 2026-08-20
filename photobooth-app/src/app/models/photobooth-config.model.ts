export interface PhotoboothBranding {
  /** App UI logo under `config/branding/` — attract, QR, style picker. */
  logoFile: string | null;
  /** AI reference logo under `config/branding/` — signage, products, accessories in generated photos. */
  aiLogoFile: string | null;
  /** Display name used in AI prompts when `{brand}` appears. */
  brandName: string | null;
  /** When true and `aiLogoFile` exists, use it during AI generation. */
  applyBrandToAi: boolean;
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
  /** Shown during inpainting when a branded background is selected. */
  thinkingStepBackground: string;
  thinkingStepImage: string;
  thinkingFootnote: string;
  /** Moments remote gallery share */
  share: string;
  sharing: string;
  shareQrTitle: string;
  shareQrHint: string;
  shareOpenPage: string;
  shareBack: string;
  uploadFailed: string;
  /** One-shot print on the result / final page (when printing is enabled). */
  print: string;
  printing: string;
  printed: string;
  printFailed: string;
}

export interface PhotoboothGalleryConfig {
  /** Push captures to Moments gallery server. */
  enabled: boolean;
  /** Public base URL, e.g. https://moments.inmomentservices.com */
  apiBaseUrl: string;
  /** Shared upload token (same as MOMENTS_UPLOAD_TOKEN on the server). */
  uploadToken: string;
  /** Daily session slug prefix → `{prefix}-YYYY-MM-DD`. */
  sessionPrefix: string;
  uploadOriginal: boolean;
  uploadFramed: boolean;
  uploadAi: boolean;
}

export const PHOTOBOOTH_DEFAULT_GALLERY: PhotoboothGalleryConfig = {
  enabled: true,
  apiBaseUrl: 'https://moments.inmomentservices.com',
  uploadToken: 'd242f34d06615494f68726947dcf3e416a0faa5a1711792723af1860dffdc008',
  sessionPrefix: 'onam',
  uploadOriginal: true,
  uploadFramed: true,
  uploadAi: true,
};

export interface PhotoboothDebugConfig {
  /** When true, Admin → Debug shows a live log panel (and a floating dock on guest screens). */
  enabled: boolean;
}

export const PHOTOBOOTH_DEFAULT_DEBUG: PhotoboothDebugConfig = {
  enabled: false,
};

export interface PhotoboothPrintConfig {
  /** Show a one-shot Print button on the result / final gallery screen. */
  enabled: boolean;
  /**
   * Windows printer name from the system printer list.
   * Empty / null = use the OS default printer.
   * Prefer the USB Canon SELPHY queue (real Canon driver). Wi‑Fi IPP queues often print grayscale / wrong layout.
   */
  printerName: string | null;
  /**
   * Borderless overscan for SELPHY (1.0 = exact fit, 1.06 = ~6% bleed past edges).
   * Removes thin white borders on USB Canon driver prints.
   */
  bleedScale: number;
}

export const PHOTOBOOTH_DEFAULT_PRINT: PhotoboothPrintConfig = {
  enabled: false,
  printerName: null,
  bleedScale: 1.06,
};

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

export interface PhotoboothCopyFrame {
  title: string;
  subtitle: string;
  continueLabel: string;
  skipLabel: string;
  applying: string;
}

export interface PhotoboothCopyCaption {
  title: string;
  subtitle: string;
  placeholder: string;
  continueLabel: string;
  skipLabel: string;
  applying: string;
}

export interface PhotoboothCopy {
  attract: PhotoboothCopyAttract;
  qr: PhotoboothCopyQr;
  capture: PhotoboothCopyCapture;
  result: PhotoboothCopyResult;
  aiMode: PhotoboothCopyAiMode;
  frame: PhotoboothCopyFrame;
  caption: PhotoboothCopyCaption;
}

export interface PhotoboothAiMode {
  id: string;
  label: string;
  /** Used for prompt-only edits when inpainting is off. */
  prompt: string;
  /** Blend guest photo into pre-made background images (inpainting workflow). */
  useInpainting?: boolean;
  /** Pick a random background from `config/ai-backgrounds/{modeId}/` per generation. */
  randomizeBackground?: boolean;
  /** Prompt sent after compositing guest onto background; overrides `prompt` when inpainting. */
  inpaintPrompt?: string;
}

/** Token replaced with `branding.brandName` (or "the brand") in AI prompts. */
export const BRAND_TOKEN = '{brand}';

/** Snippet appended when a logo reference is available for AI generation. */
export const BRAND_LOGO_AI_SNIPPET =
  'Use the brand logo from the reference image(s) exactly — reproduce it on booth signage, product boxes, DJ equipment, headphones, and clothing where natural. Do not invent a different logo or mascot.';

/** Default inpainting prompt for DJ booth modes — uses `{brand}` token. */
export const DJ_INPAINT_PROMPT =
  `Seamlessly blend the person into this DJ booth environment as the featured DJ. Preserve their exact face, features, skin tone, and likeness — do not change identity. Match scene lighting, shadows, perspective, and color grade. Reproduce the brand logo on booth furniture, product boxes, and signage. Add subtle ${BRAND_TOKEN} branding on DJ headphones or shirt where natural. Photorealistic exclusive event photo. No mascots.`;

/** Fallback prompt-only DJ mode text when inpainting is disabled. */
export const DJ_PROMPT_ONLY =
  `Transform the person into a professional DJ at an exclusive event. Place them at a DJ booth with ${BRAND_TOKEN} branding on equipment, product boxes in the background, and subtle brand logos on headphones or clothing. Preserve their exact face and likeness. Photorealistic, vibrant event lighting. No mascots.`;

/** Exact prompt for the default Newspaper style (admin may duplicate or edit in JSON). */
export const NEWSPAPER_AI_PROMPT =
  'Create a newspaper cutting style front page with the main title exactly: HAPPENING NOW! Transform the person in the uploaded photo into a whimsical black-and-white vintage newspaper front page. Place them as the main portrait in the center, styled like an old engraved photograph. Preserve the overall scene framing from the source image (whole room/context), not a tighter zoom—only use a close portrait crop if the source is already cropped that way. Surround them with bold, exaggerated headline text, narrow newspaper columns, and playful subheadings. Use high-contrast black ink on pure white background, subtle paper texture, and classic serif fonts. Add quirky, magical or humorous headlines to create a charming, slightly surreal tone. Keep the layout dense, editorial, and reminiscent of an old fantasy newspaper. Ensure the subject\'s face remains recognizable but stylized to match the printed newspaper aesthetic.';

export interface PhotoboothCameraConfig {
  /**
   * auto — Canon SDK when `edsdk-bridge.exe` is present, otherwise system webcam.
   * sdk — force Canon SDK (falls back to webcam if bridge unavailable).
   * webcam — force system camera (debug).
   */
  source: 'auto' | 'sdk' | 'webcam';
  /** Index from EDSDK `list` when using the Canon bridge. */
  sdkCameraIndex: number;
  /** `deviceId` from `navigator.mediaDevices` when using webcam. */
  webcamDeviceId: string | null;
}

export interface PhotoboothPhotoFramesConfig {
  /** After capture, let guests pick a decorative photo frame. */
  enabled: boolean;
  /** Guest photo size inside the frame hole (1 = fill hole). */
  photoScale: number;
  /** Optional default frame filename (e.g. `onam-grma-2026.png`). */
  defaultFrameFile: string | null;
  /**
   * Frame filenames offered to guests.
   * Empty array = all frames in `config/photo-frames/`.
   */
  guestFrameFiles: string[];
  /**
   * When true, skip the frame-selection screen and automatically apply a frame.
   * Uses `defaultFrameFile` if set, otherwise picks randomly from `guestFrameFiles`
   * (or all available frames when `guestFrameFiles` is empty).
   */
  autoApplyFrame: boolean;
  /**
   * After frame pick, prompt for custom text (names / message) with an in-app keyboard.
   * Placement, color, and size are set in Admin → Frames.
   */
  guestTextEnabled: boolean;
  /** Allow skipping the text step. */
  guestTextOptional: boolean;
  /** Max characters for the guest line. */
  guestTextMaxLength: number;
  /** Optional static credit under the guest line (e.g. "by inmoment photography"). */
  guestTextCreditLine: string;
  /** Horizontal position on the print, 0–100 (0 = left, 50 = center). */
  guestTextXPercent: number;
  /** Vertical position on the print, 0–100 (0 = top). */
  guestTextYPercent: number;
  /** Guest line size as a percent of print height. */
  guestTextSizePercent: number;
  /** Guest line color (#rrggbb). */
  guestTextColor: string;
  /** Credit line color (#rrggbb). */
  guestTextCreditColor: string;
  guestTextAlign: 'left' | 'center' | 'right';
  /** Soft paint swipe behind text. Off by default — outline keeps type readable. */
  guestTextBrush: boolean;
  /** 0–1 opacity of the brushstroke when enabled. */
  guestTextBrushOpacity: number;
}

export const PHOTOBOOTH_DEFAULT_PHOTO_FRAMES: PhotoboothPhotoFramesConfig = {
  enabled: true,
  photoScale: 1,
  defaultFrameFile: 'onam-grma-2026.png',
  guestFrameFiles: [],
  autoApplyFrame: false,
  guestTextEnabled: false,
  guestTextOptional: true,
  guestTextMaxLength: 36,
  guestTextCreditLine: 'by inmoment photography',
  guestTextXPercent: 50,
  guestTextYPercent: 78,
  guestTextSizePercent: 3.4,
  guestTextColor: '#c9a36a',
  guestTextCreditColor: '#d8c4a0',
  guestTextAlign: 'center',
  guestTextBrush: false,
  guestTextBrushOpacity: 0.22,
};

/** Fields returned to the renderer (admin PIN and OpenAI API key are never included). */
export interface PhotoboothConfig {
  activeThemeId: string;
  branding: PhotoboothBranding;
  camera: PhotoboothCameraConfig;
  photoFrames: PhotoboothPhotoFramesConfig;
  gallery: PhotoboothGalleryConfig;
  print: PhotoboothPrintConfig;
  debug: PhotoboothDebugConfig;
  copy: PhotoboothCopy;
  /** When true, guests must pass the QR / code unlock screen. */
  requireQrUnlock: boolean;
  /** When true, after unlock the guest picks an AI style before capture. */
  aiGenerationEnabled: boolean;
  /**
   * When set, guests skip the style screen and this mode is auto-selected.
   * Use a mode `id` from `aiModes`, or `PLAIN_PHOTO_MODE_ID` for plain capture only.
   */
  defaultAiModeId: string | null;
  /** Modes shown after QR; each carries the prompt sent to the Images API. */
  aiModes: PhotoboothAiMode[];
  /** Set only by Electron after merging config; true when `openAiApiKey` exists on disk. */
  openAiConfigured?: boolean;
}

export const PHOTOBOOTH_DEFAULT_CAMERA: PhotoboothCameraConfig = {
  source: 'auto',
  sdkCameraIndex: 0,
  webcamDeviceId: null,
};

export const PHOTOBOOTH_DEFAULT_BRANDING: PhotoboothBranding = {
  logoFile: null,
  aiLogoFile: null,
  brandName: null,
  applyBrandToAi: true,
};

export const PHOTOBOOTH_DEFAULT_AI_MODES: PhotoboothAiMode[] = [
  {
    id: 'dj',
    label: 'DJ',
    prompt: DJ_PROMPT_ONLY,
    useInpainting: true,
    randomizeBackground: true,
    inpaintPrompt: DJ_INPAINT_PROMPT,
  },
  {
    id: 'newspaper',
    label: 'Newspaper',
    prompt: NEWSPAPER_AI_PROMPT,
  },
];

export const PHOTOBOOTH_DEFAULT_COPY: PhotoboothCopy = {
  attract: {
    icon: '📷',
    tagline: 'Capturing memories',
    mainScale: 1,
    topScale: 1,
    title: 'inmoment',
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
    submit: 'Done',
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
    thinkingStepBackground: 'Selecting branded environment and compositing your photo',
    thinkingStepImage: 'Rendering with the image API',
    thinkingFootnote:
      'Runs on OpenAI Images (edit). Unlike ChatGPT, the booth cannot stream GPT‑5 “thinking” text for image jobs.',
    share: 'Share',
    sharing: 'Uploading…',
    shareQrTitle: 'Your Moments page',
    shareQrHint: 'Scan to open the same photo page on your phone — save or link your event card there.',
    shareOpenPage: 'Open Moments page',
    shareBack: 'Back',
    uploadFailed: 'Could not upload to gallery',
    print: 'Print',
    printing: 'Printing…',
    printed: 'Printed',
    printFailed: 'Print failed',
  },
  aiMode: {
    title: 'Choose a style',
    subtitle: 'Pick how we transform your photo',
    back: 'Back',
    plainPhotoLabel: 'Photocapture',
  },
  frame: {
    title: 'Choose a frame',
    subtitle: 'Pick a keepsake border for your photo',
    continueLabel: 'Use this frame',
    skipLabel: 'Skip frame',
    applying: 'Applying frame…',
  },
  caption: {
    title: 'Add your text',
    subtitle: 'Type a name or short message for the frame',
    placeholder: 'Your names or message',
    continueLabel: 'Continue',
    skipLabel: 'Skip text',
    applying: 'Creating keepsake…',
  },
};
