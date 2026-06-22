export interface PhotoboothBranding {
  /** Filename under `config/branding/` (e.g. `booth-logo.png`), or null for bundled KIA logo. */
  logoFile: string | null;
  /** Logo display scale on booth screens (50–200%, default 100). */
  logoScalePercent: number;
}

/** QR scan landing (first screen). */
export interface PhotoboothCopyQr {
  tagline: string;
  title: string;
  subtitle: string;
  scanSuccess: string;
  scanPrompt: string;
  scanning: string;
  cameraTapHint: string;
  invalidCode: string;
  adminLink: string;
  /** How long the Admin link stays visible after the secret triple-tap (seconds). */
  adminLinkVisibleSeconds: number;
}

/** Countdown timer video length on the capture screen. */
export type PhotoboothCountdownTimerSeconds = 4 | 6;

export const COUNTDOWN_TIMER_VIDEO_SRC: Record<PhotoboothCountdownTimerSeconds, string> = {
  4: 'kia/timer_video_4s.mp4',
  6: 'kia/timer_video.mp4',
};

export interface PhotoboothCopyCapture {
  starting: string;
  readyTitle: string;
  readySubtitle: string;
  footerHint: string;
  /** Which bundled timer video to play before auto-capture (4 or 6 seconds). */
  countdownTimerSeconds: PhotoboothCountdownTimerSeconds;
}

export interface PhotoboothCopyResult {
  title: string;
  subtitle: string;
  loading: string;
  uploadSuccessTitle: string;
  uploadSuccessHint: string;
  uploadContinue: string;
  uploading: string;
  uploadError: string;
  /** Minimum time on the uploading screen before success (seconds) */
  uploadMinDisplaySeconds: number;
  /** Auto-return to home after success (seconds); 0 = disabled */
  uploadAutoHomeSeconds: number;
}

export interface PhotoboothCopy {
  qr: PhotoboothCopyQr;
  capture: PhotoboothCopyCapture;
  result: PhotoboothCopyResult;
}

/** Legacy AI style picker id — not part of KIA booth copy. */
export const PLAIN_PHOTO_MODE_ID = 'photocapture';

export interface PhotoboothAiMode {
  id: string;
  label: string;
  prompt: string;
}

/** How the booth reads registration QR codes. */
export type QrScanMode = 'serial' | 'camera' | 'auto';

/** Booth camera mount: portrait rotates 90° for typical portrait booth; landscape = native sensor. */
export type PhotoboothCameraOrientation = 'portrait' | 'landscape';

export interface PhotoboothCameraConfig {
  /** portrait (default) = rotate 90° CW; landscape = no rotation */
  orientation: PhotoboothCameraOrientation;
  /** 2 = current portrait/landscape semantics; omit on legacy configs for one-time migration */
  orientationVersion?: number;
}

/** Datalogic GFS4400 USB-COM scanner (presentation / object sense). */
export interface PhotoboothScannerConfig {
  enabled: boolean;
  comPort: string;
  baudRate: number;
  qrScanMode: QrScanMode;
  cameraQrFallbackEnabled: boolean;
}

/** @deprecated Legacy sync block; migrated into `kiaApi` on load. */
export interface PhotoboothSyncConfig {
  apiBaseUrl: string;
  validatePath: string;
  uploadPath: string;
  qrPrefix: string;
  boothId: string;
}

export interface PhotoboothKiaApiPaths {
  authenticate: string;
  validate: string;
  frames: string;
  media: string;
  gallery: string;
  qrCode: string;
}

export type PhotoboothUploadImageFormat = 'png' | 'jpeg';

/** Kia Forum photo-booth API (dev / prod base URL + Bearer). */
export interface PhotoboothKiaApiConfig {
  baseUrl: string;
  /** Optional separate host for POST /photo-booth/media only; empty = use baseUrl. */
  uploadBaseUrl: string;
  bearerToken: string;
  qrPrefix: string;
  bypassCode: string;
  /** Email used to obtain bearer token when guest enters bypass code (e.g. 12345). */
  devBypassEmail: string;
  offlineAllowPrefix: boolean;
  /** When true, show a live API response log panel in the booth UI. */
  debugMode: boolean;
  /** Framed upload output: PNG keeps frame transparency; JPEG flattens to white. */
  uploadImageFormat: PhotoboothUploadImageFormat;
  paths: PhotoboothKiaApiPaths;
}

export const PHOTOBOOTH_DEFAULT_CAMERA: PhotoboothCameraConfig = {
  orientation: 'portrait',
};

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

export const PHOTOBOOTH_DEFAULT_KIA_API_PATHS: PhotoboothKiaApiPaths = {
  authenticate: '/api/kia/authenticate',
  validate: '/api/kia/photo-booth/validate',
  frames: '/api/kia/photo-booth/frames',
  media: '/api/kia/photo-booth/media',
  gallery: '/api/kia/photo-booth/gallery',
  qrCode: '/api/kia/photo-booth/qr-code',
};

export const PHOTOBOOTH_DEFAULT_KIA_API: PhotoboothKiaApiConfig = {
  baseUrl: 'https://dev-kiaforum2026.thetunagroup.com',
  uploadBaseUrl: '',
  bearerToken: '',
  qrPrefix: 'KIA-PHOTO-',
  bypassCode: '12345',
  devBypassEmail: 'nandu@tuna.group',
  offlineAllowPrefix: true,
  debugMode: false,
  uploadImageFormat: 'png',
  paths: { ...PHOTOBOOTH_DEFAULT_KIA_API_PATHS },
};

/** Exact prompt for the default Newspaper style (admin may duplicate or edit in JSON). */
export const NEWSPAPER_AI_PROMPT =
  'Create a newspaper cutting style front page with the main title exactly: HAPPENING NOW! Transform the person in the uploaded photo into a whimsical black-and-white vintage newspaper front page. Place them as the main portrait in the center, styled like an old engraved photograph. Preserve the overall scene framing from the source image (whole room/context), not a tighter zoom—only use a close portrait crop if the source is already cropped that way. Surround them with bold, exaggerated headline text, narrow newspaper columns, and playful subheadings. Use high-contrast black ink on pure white background, subtle paper texture, and classic serif fonts. Add quirky, magical or humorous headlines to create a charming, slightly surreal tone. Keep the layout dense, editorial, and reminiscent of an old fantasy newspaper. Ensure the subject\'s face remains recognizable but stylized to match the printed newspaper aesthetic.';

/** Fields returned to the renderer (admin PIN and OpenAI API key are never included). */
export interface PhotoboothConfig {
  activeThemeId: string;
  branding: PhotoboothBranding;
  copy: PhotoboothCopy;
  camera: PhotoboothCameraConfig;
  scanner: PhotoboothScannerConfig;
  /** @deprecated Use `kiaApi`; kept for saved JSON compatibility. */
  sync: PhotoboothSyncConfig;
  kiaApi: PhotoboothKiaApiConfig;
  /** When true, after QR the guest picks an AI style before capture. */
  aiGenerationEnabled: boolean;
  /** Modes shown after QR; each carries the prompt sent to the Images API. */
  aiModes: PhotoboothAiMode[];
  /** Set only by Electron after merging config; true when `openAiApiKey` exists on disk. */
  openAiConfigured?: boolean;
  /** Set only by Electron; true when `kiaApi.bearerToken` is stored on disk. */
  bearerConfigured?: boolean;
}

export const PHOTOBOOTH_DEFAULT_BRANDING: PhotoboothBranding = {
  logoFile: null,
  logoScalePercent: 100,
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
    tagline: 'Movement that inspires',
    title: 'Capture Your KIA Moment',
    subtitle: 'Personalized keepsake experience.',
    scanSuccess: 'QR verified',
    scanPrompt: 'Scan your QR code to get started',
    scanning: 'Scanning…',
    cameraTapHint: 'Tap the QR area to use the booth camera',
    invalidCode: 'Invalid QR code. Please use your registration code.',
    adminLink: 'Admin',
    adminLinkVisibleSeconds: 300,
  },
  capture: {
    starting: 'Starting camera…',
    readyTitle: 'Get Ready',
    readySubtitle: 'Strike Your Best Pose',
    footerHint: 'Look at camera and hold still.',
    countdownTimerSeconds: 6,
  },
  result: {
    title: 'Your KIA Keepsake is Ready',
    subtitle: 'Download your photo.',
    loading: 'Loading…',
    uploadSuccessTitle: 'Upload completed successfully',
    uploadSuccessHint: 'Check your KIA hub photogallery for the picture',
    uploadContinue: 'Continue',
    uploading: 'Uploading your photo…',
    uploadError: 'Upload failed. Please try again.',
    uploadMinDisplaySeconds: 3,
    uploadAutoHomeSeconds: 10,
  },
};
