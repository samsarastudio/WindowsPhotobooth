export interface PbPaths {
  portableRoot: string;
  captureDir: string;
  themesDir?: string;
  configPath?: string;
  logsDir?: string;
  logFile?: string;
  hasBridge: boolean;
}

export interface PbCameraResult {
  ok: boolean;
  err?: number | string;
  msg?: string;
  path?: string;
  cameras?: string[];
  previewFileUrl?: string | null;
  imageBase64?: string | null;
  readErr?: string;
}

export interface PhotoboothConfigPublic {
  activeThemeId: string;
  branding?: Record<string, unknown>;
  copy: Record<string, unknown>;
}

export interface PbThemeListItem {
  id: string;
  folder: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
}

export interface PbApi {
  getPaths(): Promise<PbPaths>;
  log(payload: {
    level?: 'info' | 'warn' | 'error' | 'debug';
    scope?: string;
    message: string;
    detail?: unknown;
    skipBroadcast?: boolean;
  }): Promise<{ ok: boolean; logFile?: string; error?: string }>;
  readLogTail(payload?: {
    maxLines?: number;
  }): Promise<{ ok: boolean; lines?: string[]; logFile?: string; error?: string }>;
  openLogsFolder(): Promise<{ ok: boolean; path?: string; error?: string }>;
  onAppLogEntry?(
    cb: (entry: {
      ts?: string;
      level?: string;
      scope?: string;
      message?: string;
      detail?: string;
    }) => void,
  ): () => void;
  cameraInvoke(cmd: Record<string, unknown>): Promise<PbCameraResult>;
  readFileBase64(filePath: string): Promise<string>;
  saveJpeg(fullPath: string, base64Body: string): Promise<{ ok: boolean; path?: string }>;
  adminGetConfig(): Promise<{ ok: boolean; config?: PhotoboothConfigPublic; error?: string }>;
  adminSaveConfig(
    partial: Record<string, unknown>,
  ): Promise<{ ok: boolean; config?: PhotoboothConfigPublic; error?: string }>;
  adminTestOpenAiKey(
    draftKey?: string,
  ): Promise<{ ok: boolean; message?: string; error?: string }>;
  adminListThemes(): Promise<{ ok: boolean; themes?: PbThemeListItem[]; error?: string }>;
  adminGetThemeStylesheetUrl(): Promise<{ ok: boolean; url?: string | null; error?: string }>;
  adminPickThemeZip(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  adminInstallThemeFromZip(
    zipPath: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }>;
  adminExportThemeZip(themeId: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  adminDeleteTheme(themeId: string): Promise<{
    ok: boolean;
    removedId?: string;
    switchedActiveToDefault?: boolean;
    error?: string;
  }>;
  adminExportThemeTemplate(): Promise<{ ok: boolean; path?: string; error?: string }>;
  adminVerifyPin(pin: string): Promise<{ ok: boolean; valid?: boolean; error?: string }>;
  adminPickLogoImage(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  adminInstallLogo(
    sourcePath: string,
  ): Promise<{ ok: boolean; logoFile?: string; url?: string; error?: string }>;
  adminClearLogo(): Promise<{ ok: boolean; error?: string }>;
  adminGetBrandingLogoUrl(): Promise<{ ok: boolean; url?: string | null; error?: string }>;
  adminPickAiLogoImage(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  adminInstallAiLogo(
    sourcePath: string,
  ): Promise<{ ok: boolean; aiLogoFile?: string; url?: string; error?: string }>;
  adminClearAiLogo(): Promise<{ ok: boolean; error?: string }>;
  adminGetAiBrandLogoUrl(): Promise<{ ok: boolean; url?: string | null; error?: string }>;
  adminListAiBackgrounds(modeId: string): Promise<{
    ok: boolean;
    modeId?: string;
    backgrounds?: { filename: string; url: string }[];
    error?: string;
  }>;
  adminPickAiBackgroundImage(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  adminInstallAiBackground(
    modeId: string,
    sourcePath: string,
  ): Promise<{ ok: boolean; modeId?: string; filename?: string; url?: string; error?: string }>;
  adminDeleteAiBackground(
    modeId: string,
    filename: string,
  ): Promise<{ ok: boolean; removed?: string; error?: string }>;
  openAiGenerateImage(payload: {
    imagePath: string;
    prompt: string;
    modeId?: string;
    useInpainting?: boolean;
    randomizeBackground?: boolean;
    inpaintPrompt?: string;
  }): Promise<{
    ok: boolean;
    path?: string;
    model?: string;
    backgroundUsed?: string | null;
    inpainting?: boolean;
    brandApplied?: boolean;
    error?: string;
  }>;
  listPhotoFrames(): Promise<{
    ok: boolean;
    frames?: { filename: string; label: string; url: string }[];
    error?: string;
  }>;
  applyPhotoFrame(payload: {
    imagePath: string;
    frameFile: string;
    photoScale?: number;
    /** Guest caption drawn in the frame footer (after overlay). */
    guestText?: string;
    /** Optional credit under guest text. */
    creditLine?: string;
  }): Promise<{ ok: boolean; path?: string; frameFile?: string; error?: string }>;
  adminPickPhotoFrameImage(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  adminInstallPhotoFrame(
    sourcePath: string,
  ): Promise<{ ok: boolean; filename?: string; url?: string; error?: string }>;
  adminDeletePhotoFrame(
    filename: string,
  ): Promise<{ ok: boolean; removed?: string; error?: string }>;
  galleryEnsureDaySession(payload: {
    apiBaseUrl: string;
    uploadToken: string;
    eventPrefix: string;
  }): Promise<{
    ok: boolean;
    slug?: string;
    galleryUrl?: string;
    expiresAt?: string;
    error?: string;
  }>;
  galleryUploadPhoto(payload: {
    apiBaseUrl: string;
    uploadToken: string;
    eventPrefix: string;
    filePath: string;
    variant: 'original' | 'framed' | 'ai';
  }): Promise<{
    ok: boolean;
    queued?: boolean;
    status?: string;
    slug?: string;
    photoId?: string;
    shareUrl?: string;
    url?: string;
    variant?: string;
    error?: string;
  }>;
  galleryFlushUploadQueue(): Promise<{
    ok: boolean;
    uploaded?: number;
    failed?: number;
    pending?: number;
    busy?: boolean;
    error?: string;
  }>;
  galleryGetUploadQueueItem(filePath: string): Promise<{
    ok: boolean;
    item?: {
      filePath: string;
      variant: string;
      status: string;
      photoId?: string;
      shareUrl?: string;
      url?: string;
      error?: string;
    } | null;
    error?: string;
  }>;
  onGalleryUploadQueueUpdated?(
    cb: (item: {
      filePath: string;
      variant?: string;
      status?: string;
      photoId?: string;
      shareUrl?: string;
      url?: string;
      error?: string;
    }) => void,
  ): () => void;
  gallerySyncFrames(payload: {
    apiBaseUrl: string;
    uploadToken?: string;
    pushLocal?: boolean;
    pruneLocal?: boolean;
    timeoutMs?: number;
  }): Promise<{
    ok: boolean;
    offline?: boolean;
    synced?: string[];
    skipped?: string[];
    published?: string[];
    pruned?: string[];
    failed?: { filename: string; error: string }[];
    count?: number;
    skippedCount?: number;
    publishedCount?: number;
    prunedCount?: number;
    error?: string;
  }>;
  galleryPublishFrame(payload: {
    apiBaseUrl: string;
    uploadToken: string;
    filename: string;
  }): Promise<{ ok: boolean; frame?: { filename: string }; error?: string }>;
  galleryDeleteRemoteFrame(payload: {
    apiBaseUrl: string;
    uploadToken: string;
    filename: string;
  }): Promise<{ ok: boolean; removed?: string; error?: string }>;
  listPrinters(): Promise<{
    ok: boolean;
    printers?: {
      name: string;
      displayName: string;
      description: string;
      isDefault: boolean;
      status: number;
      driverName?: string;
      portName?: string;
      /** Microsoft IPP / WSD — often grayscale + wrong layout on SELPHY */
      isIppClass?: boolean;
      /** Real Canon / SELPHY driver (USB or TCP/IP with Canon software) */
      isCanonDriver?: boolean;
    }[];
    error?: string;
  }>;
  printPhoto(payload: {
    filePath: string;
    deviceName?: string | null;
  }): Promise<{ ok: boolean; deviceName?: string | null; paper?: string | null; error?: string }>;
}

declare global {
  interface Window {
    pbApi?: PbApi;
  }
}

export {};
