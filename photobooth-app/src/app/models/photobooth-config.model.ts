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
  /** Shown on preview while shutter / frame processing runs. */
  capturing: string;
}

export interface PhotoboothCopyResult {
  title: string;
  loading: string;
  savedPrefix: string;
  retake: string;
  submit: string;
  /** Preview screen: keep this photo — uploads, then shows share/print/finish. */
  confirmPhoto: string;
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
  shareBack: string;
  uploadFailed: string;
  /** One-shot print on the result / final page (when printing is enabled). */
  print: string;
  printing: string;
  printed: string;
  printFailed: string;
  /** Dual-cell cut sheet from the original capture (normal result only). */
  makePhysical: string;
  remakePhysical: string;
  makingPhysical: string;
  physicalErrorPrefix: string;
  makeFramed: string;
  remakeFramed: string;
  makingFramed: string;
  framedErrorPrefix: string;
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
  /** Dual-column cut sheets — stored for Moments admin download, not guest wall/gallery. */
  uploadPhysical: boolean;
}

export const PHOTOBOOTH_DEFAULT_GALLERY: PhotoboothGalleryConfig = {
  enabled: true,
  apiBaseUrl: 'https://moments.inmomentservices.com',
  uploadToken: '26bdcbbb413c1063f472b95cc2f75ab5137f28a9cdd8c7d5',
  sessionPrefix: 'onam',
  uploadOriginal: true,
  uploadFramed: true,
  uploadAi: true,
  uploadPhysical: true,
};

export interface PhotoboothCaptureConfig {
  /** Seconds shown before shutter (3, 5, etc.). */
  countdownSeconds: number;
}

export const PHOTOBOOTH_DEFAULT_CAPTURE: PhotoboothCaptureConfig = {
  countdownSeconds: 5,
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
   * Windows printer queue name.
   * Empty / null = auto-pick USB Canon/SELPHY first, then Wi‑Fi if allowWifiPrinters.
   */
  printerName: string | null;
  /**
   * Borderless overscan for regular photo prints (1.0 = exact fit, 1.06 = ~6% bleed).
   * Physical-frame cut sheets ignore this and print 1:1 on 148×100 mm postcard stock.
   */
  bleedScale: number;
  /**
   * White margin on the left and right of framed (digital frame) prints so SELPHY
   * borderless overscan does not eat the decorative border. Ignored for unframed camera JPEGs.
   */
  framedEdgeInsetMm: number;
  /**
   * Extra white at the bottom only. 3:2 frames are slightly wider than 148×100 mm stock,
   * and SELPHY overscans the trailing edge more than the sides.
   */
  framedBottomExtraMm: number;
  /** Include Wi‑Fi / IPP / WSD queues in the printer list (USB is still preferred). */
  allowWifiPrinters: boolean;
}

export const PHOTOBOOTH_DEFAULT_PRINT: PhotoboothPrintConfig = {
  enabled: false,
  printerName: null,
  bleedScale: 1.06,
  framedEdgeInsetMm: 4,
  framedBottomExtraMm: 2.5,
  allowWifiPrinters: false,
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
  /** Top-level card that opens the AI Portrait character picker. */
  portraitEntryLabel: string;
  portraitEntryHint: string;
  sceneEntryHint: string;
}

export interface PhotoboothCopyPortraitSelect {
  title: string;
  subtitle: string;
  back: string;
}

export interface PhotoboothCopySceneSelect {
  title: string;
  subtitle: string;
  back: string;
}

export interface PhotoboothCopyBoothMode {
  title: string;
  subtitle: string;
  /** Photo Print experience */
  defaultLabel: string;
  defaultHint: string;
  /** AI Halloween Portrait experience */
  aiPortraitLabel: string;
  aiPortraitHint: string;
  /** Optional Scene Addition */
  sceneLabel: string;
  sceneHint: string;
  /** Note that magnet/physical is offered at the end of every path */
  magnetNote: string;
  /** @deprecated kept for older configs — no longer shown as a start mode */
  physicalLabel: string;
  physicalHint: string;
  back: string;
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

export interface PhotoboothCopyHistory {
  title: string;
  empty: string;
  back: string;
  ariaOpen: string;
  filterAll: string;
  filterPhysical: string;
  filterDigital: string;
  filterOriginal: string;
  whenAll: string;
  whenToday: string;
  whenYesterday: string;
  whenWeek: string;
  whenMonth: string;
  whenCustom: string;
  deleteLabel: string;
  deleteConfirm: string;
  cancel: string;
  previewHint: string;
  reprint: string;
  makePhysical: string;
  remakePhysical: string;
  makingPhysical: string;
  originalLabel: string;
  makeFramed: string;
  remakeFramed: string;
  makingFramed: string;
  pickFrameTitle: string;
  pickFrameHint: string;
  applyFrame: string;
}

export interface PhotoboothCopyThanks {
  title: string;
  subtitle: string;
  /** Small line under subtitle (e.g. photo will be ready shortly). */
  footnote: string;
  done: string;
}

export interface PhotoboothCopy {
  attract: PhotoboothCopyAttract;
  qr: PhotoboothCopyQr;
  capture: PhotoboothCopyCapture;
  result: PhotoboothCopyResult;
  history: PhotoboothCopyHistory;
  aiMode: PhotoboothCopyAiMode;
  portraitSelect: PhotoboothCopyPortraitSelect;
  sceneSelect: PhotoboothCopySceneSelect;
  boothMode: PhotoboothCopyBoothMode;
  frame: PhotoboothCopyFrame;
  caption: PhotoboothCopyCaption;
  frameAdjust: PhotoboothCopyPhysicalAdjust;
  physicalAdjust: PhotoboothCopyPhysicalAdjust;
  thanks: PhotoboothCopyThanks;
}

export interface PhotoboothCopyPhysicalAdjust {
  title: string;
  hint: string;
  confirm: string;
  cancel: string;
  zoomLabel: string;
}

/** AI generation pipeline. */
export type PhotoboothAiPipeline = 'scene' | 'head-swap' | 'prompt';

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
  /**
   * `scene` — keep guests, inpaint Halloween scenery around them (face locked).
   * `head-swap` — Zyn-style character plate + guest head (face locked).
   * `prompt` — full-image edit (legacy).
   */
  pipeline?: PhotoboothAiPipeline;
  /** Hide from the top-level AI mode list (e.g. portrait characters live under AI Portrait). */
  portraitOnly?: boolean;
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

/** Scene Addition — keep cropped guests, paint Halloween scenery around them. */
export const HALLOWEEN_SCENE_PROMPT =
  `Place the guests exactly as captured into this Halloween environment. Keep every face, body, arm, leg, foot, skin tone, hair, clothing, pose, and likeness 100% unchanged — never alter identity or invent extra limbs. Only invent cinematic Halloween scenery around them (fog, lanterns, autumn light). Match scene lighting on clothing edges only. Photorealistic event photo.`;

export const HALLOWEEN_SCENE_INPAINT =
  `BLEND the guests into this Halloween scene — do not recreate them. CRITICAL: keep every person exactly as placed (faces, bodies, legs, feet, clothing, pose, count). NEVER invent extra legs, limbs, or people. Only replace the indoor room/booth background around them with matching Halloween atmosphere, lighting, and depth. Soft natural contact shadows under feet. Photorealistic. No face filters, no costume makeup, no identity change, no body regeneration.`;

/** Shared head-swap prompts for Halloween AI Portrait — aligned with Zyn Photobooth-AICore. */
export const HEAD_SWAP_PROMPT =
  'Clean seamless head replacement: guest likeness at natural size matching the original character head. Keep a natural short adult neck for portrait mode — chin nestled into the costume collar with almost no throat gap. Do not elongate the neck or float the head. No oval outline. Keep the costume body and Halloween scene.';

export const HEAD_SWAP_INPAINT =
  "CLEAN SEAMLESS HEAD REPLACEMENT WITH NATURAL PORTRAIT ANATOMY. Image 1 is this Halloween character scene with a small guest-head reference on the character. Image 2 is a tight crop of the guest's real head. Replace the character head with the guest at NATURAL PROPORTION — the head must match the original character head size relative to the shoulders (do not enlarge or float the head higher). Exact guest likeness: eyes, nose, mouth, jaw, skin, hair. ANATOMY (critical for portrait): Keep a natural, short adult neck. Preserve the original Image-1 vertical distance from chin to shoulders/collar — if anything, sit the chin slightly closer to the collar. The chin must sit nestled into / immediately above the costume collar — no tall gap of neck skin, no elongated or stretched neck, no floating head. Do not raise the head above the original character head position. Completely erase the old character head/hair. NO oval outline, cutout edge, mask ring, or halo. Softly blend only that short neck into the collar. Keep the costume body, pose, props, camera angle, and lighting unchanged. Do not copy guest clothing or booth background. NEVER alter the guest face.";

export const HALLOWEEN_PORTRAIT_IDS = [
  'vampire',
  'witch',
  'werewolf',
  'reaper',
  'phantom',
  'bride',
  'morticia',
] as const;

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
  /**
   * Optional default frame filename for landscape / 6×4 (e.g. `halloween-haunt.png`).
   */
  defaultFrameFile: string | null;
  /**
   * Optional default frame for portrait / 4×6 AI Portrait (e.g. `halloween-haunt-portrait.png`).
   */
  defaultPortraitFrameFile: string | null;
  /**
   * Frame filenames offered to guests.
   * Empty array = all frames in `config/photo-frames/`.
   */
  guestFrameFiles: string[];
  /**
   * When true, skip the frame-selection screen and automatically apply a frame.
   * Uses `defaultFrameFile` / `defaultPortraitFrameFile` by photo orientation,
   * otherwise picks randomly from matching `guestFrameFiles`
   * (or all available frames when `guestFrameFiles` is empty).
   */
  autoApplyFrame: boolean;
  /**
   * After frame pick (or auto-apply), show zoom/pan so faces sit in the opening.
   * Remake-from-original always shows this, even when this flag is off.
   */
  guestAdjustPhoto: boolean;
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
  defaultFrameFile: 'halloween-haunt.png',
  defaultPortraitFrameFile: 'halloween-haunt-portrait.png',
  guestFrameFiles: ['halloween-haunt.png', 'halloween-haunt-portrait.png'],
  autoApplyFrame: false,
  guestAdjustPhoto: true,
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

/** Guest experience mode ids. */
export type PhotoboothBoothModeId = 'default' | 'physicalFrame';

/** Which experience buttons guests see after Tap to start. */
export interface PhotoboothGuestModesConfig {
  /** Classic digital frames / AI flow. */
  defaultEnabled: boolean;
  /** Dual cut-sheet for physical photo frames. */
  physicalFrameEnabled: boolean;
}

export const PHOTOBOOTH_DEFAULT_GUEST_MODES: PhotoboothGuestModesConfig = {
  defaultEnabled: true,
  physicalFrameEnabled: true,
};

/**
 * Guest post-capture flow. When skipAiPreviewToThanks is on, AI guests never wait
 * on the generating / preview screens — they see Thank you while AI + Moments upload
 * finish in the background; operators approve print on the tablet.
 */
export interface PhotoboothGuestFlowConfig {
  /**
   * After the guest confirms their photo with an AI mode selected, skip the AI
   * wait + result gallery and go straight to Thank you. AI runs in the background
   * and lands on Moments for tablet review / print.
   */
  skipAiPreviewToThanks: boolean;
  /** Seconds on Thank you before returning to attract (0 = stay until tap). */
  thanksAutoReturnSec: number;
  /** Booth id claimed by Moments print jobs (tablet → kiosk). */
  boothId: string;
}

export const PHOTOBOOTH_DEFAULT_GUEST_FLOW: PhotoboothGuestFlowConfig = {
  skipAiPreviewToThanks: false,
  thanksAutoReturnSec: 8,
  boothId: 'booth-1',
};

/**
 * Dual cut-sheet for physical photo frames.
 * Landscape capture is rotated 90°, then placed twice in portrait cells (columns).
 * Cell outer size in cm is the printed ruler size on SELPHY 148×100 mm paper.
 * Gap/margins auto-fill leftover postcard space. Safe insets only move the photo
 * inside each cell. Global print bleed is not applied.
 */
export interface PhotoboothPhysicalFrameConfig {
  /** Width of each cut cell (cm). */
  cellWidthCm: number;
  /** Height of each cut cell (cm). */
  cellHeightCm: number;
  /** White inset between cell edge and decorative border (mm). */
  innerPaddingMm: number;
  /** Safe photo area inside the frame — keeps heads inside physical insert (mm). */
  safeInsetTopMm: number;
  safeInsetBottomMm: number;
  safeInsetLeftMm: number;
  safeInsetRightMm: number;
  /** Gap between the two columns (mm). */
  gapMm: number;
  /** Outer margin around the sheet (mm). */
  marginMm: number;
  /**
   * Extra white around the cut sheet when sending to SELPHY.
   * CP1500 borderless overscans ~3–5 mm; this keeps gold frames inside the paper.
   */
  printerCropInsetMm: number;
  dpi: number;
  /** Rotate landscape capture before fitting into each cell (90 or -90). */
  rotateDegrees: 90 | -90;
  /** Draw thin double-line border with corner accents inside each cell. */
  borderEnabled: boolean;
}

export const PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME: PhotoboothPhysicalFrameConfig = {
  cellWidthCm: 5.3,
  cellHeightCm: 7.8,
  innerPaddingMm: 3,
  safeInsetTopMm: 0.2,
  safeInsetBottomMm: 0.2,
  safeInsetLeftMm: 3,
  safeInsetRightMm: 1,
  gapMm: 6.35,
  marginMm: 6.35,
  printerCropInsetMm: 4,
  dpi: 300,
  rotateDegrees: -90,
  borderEnabled: true,
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
  capture: PhotoboothCaptureConfig;
  /**
   * Which guest modes are offered after Tap to start.
   * When more than one is enabled, guests pick on `/booth-mode`.
   */
  guestModes: PhotoboothGuestModesConfig;
  guestFlow: PhotoboothGuestFlowConfig;
  physicalFrame: PhotoboothPhysicalFrameConfig;
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
    id: 'scene',
    label: 'Scene Addition',
    prompt: HALLOWEEN_SCENE_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HALLOWEEN_SCENE_INPAINT,
    pipeline: 'scene',
  },
  {
    id: 'vampire',
    label: 'Vampire',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
  {
    id: 'witch',
    label: 'Witch',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
  {
    id: 'werewolf',
    label: 'Werewolf',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
  {
    id: 'reaper',
    label: 'Reaper',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
  {
    id: 'phantom',
    label: 'Phantom',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
  {
    id: 'bride',
    label: 'Bride',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
  {
    id: 'morticia',
    label: 'Morticia',
    prompt: HEAD_SWAP_PROMPT,
    useInpainting: true,
    randomizeBackground: false,
    inpaintPrompt: HEAD_SWAP_INPAINT,
    pipeline: 'head-swap',
    portraitOnly: true,
  },
];

export const PHOTOBOOTH_DEFAULT_COPY: PhotoboothCopy = {
  attract: {
    icon: '🎃',
    tagline: 'Enter if you dare',
    mainScale: 1,
    topScale: 1,
    title: 'HauntBooth',
    subtitle: 'Tap to transform into a\nHalloween keepsake.',
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
    capturing: 'Capturing…',
  },
  result: {
    title: 'Your photo',
    loading: 'Loading…',
    savedPrefix: 'Saved:',
    retake: 'Retake',
    submit: 'Done',
    confirmPhoto: 'Done',
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
    shareQrTitle: 'Scan to view your photo',
    shareQrHint: 'Scan with your phone to open your photo — save or link your event card there.',
    shareBack: 'Back',
    uploadFailed: 'Could not upload to gallery',
    print: 'Print',
    printing: 'Printing…',
    printed: 'Printed',
    printFailed: 'Print failed',
    makePhysical: 'Make glow magnet',
    remakePhysical: 'Remake glow magnet',
    makingPhysical: 'Creating magnet sheet…',
    physicalErrorPrefix: 'Magnet failed:',
    makeFramed: 'Make framed',
    remakeFramed: 'Remake framed',
    makingFramed: 'Applying frame…',
    framedErrorPrefix: 'Frame failed:',
  },
  history: {
    title: 'Photo history',
    empty: 'No photos yet — every capture on this booth appears here so you can reprint.',
    back: 'Back to start',
    ariaOpen: 'Photo history — reprint any capture',
    filterAll: 'All',
    filterPhysical: 'Physical',
    filterDigital: 'Digital',
    filterOriginal: 'Originals',
    whenAll: 'All dates',
    whenToday: 'Today',
    whenYesterday: 'Yesterday',
    whenWeek: 'Last 7 days',
    whenMonth: 'This month',
    whenCustom: 'Custom dates',
    deleteLabel: 'Delete',
    deleteConfirm: 'Delete this photo from this booth? This cannot be undone.',
    cancel: 'Cancel',
    previewHint: 'Tap a photo to preview',
    reprint: 'Reprint',
    makePhysical: 'Make physical sheet',
    remakePhysical: 'Remake physical sheet',
    makingPhysical: 'Creating sheet…',
    originalLabel: 'Original',
    makeFramed: 'Make framed',
    remakeFramed: 'Remake framed',
    makingFramed: 'Applying frame…',
    pickFrameTitle: 'Choose a frame',
    pickFrameHint: 'Applied to this original. Same overlay guests get after capture.',
    applyFrame: 'Apply frame',
  },
  aiMode: {
    title: 'Pick your spell',
    subtitle: 'Scene Addition keeps your faces — AI Portrait drops you into a costume',
    back: 'Back',
    plainPhotoLabel: 'Photocapture',
    portraitEntryLabel: 'AI Portrait',
    portraitEntryHint: 'Become one of five Halloween characters — your face stays yours',
    sceneEntryHint: 'Keep your group as-is and paint haunted scenery around you',
  },
  portraitSelect: {
    title: 'Choose your haunt',
    subtitle: 'Pick a character — we keep your real face',
    back: 'Back',
  },
  sceneSelect: {
    title: 'Choose your scene',
    subtitle: 'Pick the Halloween backdrop for your group',
    back: 'Back',
  },
  boothMode: {
    title: 'Choose your experience',
    subtitle: 'Every visit includes a digital framed copy. Add a glow magnet at the end if you like.',
    defaultLabel: 'Photo Print',
    defaultHint: 'Original photo with a custom Screampark frame and digital copy',
    aiPortraitLabel: 'AI Halloween Portrait',
    aiPortraitHint: 'Become a haunt character — your real face, costume look, framed digital copy',
    sceneLabel: 'Scene Addition',
    sceneHint: 'Keep your group as-is and paint Halloween scenery around you',
    magnetNote: 'Glow-in-the-Dark Photo Magnet is available after your photo — for Photo Print or AI Portrait.',
    physicalLabel: 'Glow magnet',
    physicalHint: 'Dual cut sheet for glow-in-the-dark magnets',
    back: 'Back',
  },
  frame: {
    title: 'Choose a frame',
    subtitle: 'Pick a keepsake border for your photo',
    continueLabel: 'Use this frame',
    skipLabel: 'Skip frame',
    applying: 'Applying frame…',
  },
  frameAdjust: {
    title: 'Align photo in the frame',
    hint: 'Drag to move. Use + / − to zoom so faces sit in the opening.',
    confirm: 'Use this crop',
    cancel: 'Back',
    zoomLabel: 'Zoom',
  },
  caption: {
    title: 'Add your text',
    subtitle: 'Type a name or short message for the frame',
    placeholder: 'Your names or message',
    continueLabel: 'Continue',
    skipLabel: 'Skip text',
    applying: 'Creating keepsake…',
  },
  thanks: {
    title: 'Thank you!',
    subtitle: 'Your photo is being prepared.',
    footnote: 'Pick it up at the Moments station when ready.',
    done: 'Done',
  },
  physicalAdjust: {
    title: 'Adjust photo in the frame',
    hint: 'Drag to move. Use + / − to zoom and crop extra background. Both prints stay identical. Each cell prints at the centimetre size set in Admin.',
    confirm: 'Create sheet',
    cancel: 'Back',
    zoomLabel: 'Zoom',
  },
};
