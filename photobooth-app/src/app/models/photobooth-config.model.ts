export interface PhotoboothBranding {
  /** Filename under `config/branding/` (e.g. `booth-logo.png`), or null for emoji icons. */
  logoFile: string | null;
}

export interface PhotoboothCopyAttract {
  icon: string;
  title: string;
  subtitle: string;
  startAria: string;
  adminLink: string;
}

export interface PhotoboothCopyQr {
  icon: string;
  title: string;
  subtitle: string;
  codeLabel: string;
  ok: string;
  back: string;
  invalidCode: string;
  debugHint: string;
  bypassCode: string;
}

export interface PhotoboothCopyCapture {
  sideTitle: string;
  instructions: string;
  starting: string;
}

export interface PhotoboothCopyResult {
  title: string;
  loading: string;
  savedPrefix: string;
  retake: string;
  submit: string;
}

export interface PhotoboothCopy {
  attract: PhotoboothCopyAttract;
  qr: PhotoboothCopyQr;
  capture: PhotoboothCopyCapture;
  result: PhotoboothCopyResult;
}

/** Fields returned to the renderer (admin PIN is never included). */
export interface PhotoboothConfig {
  activeThemeId: string;
  branding: PhotoboothBranding;
  copy: PhotoboothCopy;
}

export const PHOTOBOOTH_DEFAULT_BRANDING: PhotoboothBranding = {
  logoFile: null,
};

export const PHOTOBOOTH_DEFAULT_COPY: PhotoboothCopy = {
  attract: {
    icon: '📷',
    title: 'PhotoBooth',
    subtitle: 'Touch anywhere to begin',
    startAria: 'Start',
    adminLink: 'Admin',
  },
  qr: {
    icon: '🔐',
    title: 'Scan & unlock',
    subtitle: 'Enter session code (placeholder — type 1234)',
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
  },
  result: {
    title: 'Your photo',
    loading: 'Loading…',
    savedPrefix: 'Saved:',
    retake: 'Retake',
    submit: 'Submit',
  },
};
