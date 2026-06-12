export interface PbPaths {
  portableRoot: string;
  captureDir: string;
  themesDir?: string;
  configPath?: string;
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

export interface PbScannerPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
  friendlyName?: string;
}

export interface PbScannerCodePayload {
  code: string;
}

export interface PbScannerStatusPayload {
  status: string;
}

export interface PbSyncValidateResult {
  ok: boolean;
  valid: boolean;
  offline?: boolean;
  usedPrefixFallback?: boolean;
  sessionData?: string | null;
  email?: string | null;
  error?: string;
  message?: string | null;
  statusCode?: number;
}

export interface PbSyncEnqueueEntry {
  token: string;
  photos: string[];
  frameId?: number | null;
}

export interface PbKiaEnqueueMediaEntry {
  sessionToken: string;
  imagePath: string;
  frameId?: number | null;
  frameImagePath?: string | null;
  bearerToken?: string | null;
  guestEmail?: string | null;
}

export interface PbPhotoBoothFrame {
  id: number;
  name?: string;
  label?: string;
  slug?: string;
  thumbnail?: string;
  frame_image?: string;
  frameImage?: string;
  image_url?: string;
  imageUrl?: string;
  file_path?: string;
  orientation?: string;
  sort_order?: number;
  is_active?: number | boolean;
  is_premium?: number | boolean;
  is_unlocked?: number | boolean;
  unlock_points?: number | null;
  points_required?: number;
}

export interface PbKiaFetchFramesResult {
  ok: boolean;
  frames: PbPhotoBoothFrame[];
  fromCache?: boolean;
  offline?: boolean;
  /** api-live | cache-fallback | cache-offline */
  frameListSource?: string;
  framesCachedAt?: string | null;
  bundledFrameIds?: number[];
  error?: string;
  debug?: {
    source?: string;
    count?: number;
    unlocked?: number;
    totalPoints?: string | null;
    statusCode?: number;
    cachedAt?: string | null;
    message?: string;
  };
}

export interface PbKiaGalleryItem {
  id: number;
  photo_booth_session_id: number;
  photo_booth_frame_id: number | null;
  file_path: string;
  thumbnail: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface PbKiaFetchGalleryResult {
  ok: boolean;
  items: PbKiaGalleryItem[];
  offline?: boolean;
  error?: string;
}

export interface PbKiaUploadQueueStatus {
  ok: boolean;
  pending: number;
  items?: Array<{
    id: string;
    sessionToken: string;
    attempts: number;
    enqueuedAt: string;
    lastError: string | null;
  }>;
  error?: string;
}

export interface PbKiaApiDebugEntry {
  at: string;
  kind?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  ok?: boolean;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
}

export interface PbApi {
  getPaths(): Promise<PbPaths>;
  cameraInvoke(cmd: Record<string, unknown>): Promise<PbCameraResult>;
  readFileBase64(filePath: string): Promise<string>;
  fetchImageDataUrl(
    url: string,
  ): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
  saveJpeg(fullPath: string, base64Body: string): Promise<{ ok: boolean; path?: string }>;
  adminGetConfig(): Promise<{ ok: boolean; config?: PhotoboothConfigPublic; error?: string }>;
  adminSaveConfig(
    partial: Record<string, unknown>,
  ): Promise<{ ok: boolean; config?: PhotoboothConfigPublic; error?: string }>;
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
  openAiGenerateImage(payload: {
    imagePath: string;
    prompt: string;
  }): Promise<{ ok: boolean; path?: string; model?: string; error?: string }>;
  scannerListPorts(): Promise<{ ok: boolean; ports?: PbScannerPortInfo[]; error?: string }>;
  scannerGetStatus(): Promise<{ ok: boolean; status?: string; lastCode?: string; error?: string }>;
  scannerOpen(
    portPath: string,
    baudRate?: number,
  ): Promise<{ ok: boolean; status?: string; error?: string }>;
  scannerClose(): Promise<{ ok: boolean; status?: string; error?: string }>;
  onScannerCode(handler: (payload: PbScannerCodePayload) => void): () => void;
  onScannerStatus(handler: (payload: PbScannerStatusPayload) => void): () => void;
  onScannerError(handler: (payload: { error: string }) => void): () => void;
  syncValidateToken(token: string): Promise<PbSyncValidateResult>;
  syncEnqueueSession(entry: PbSyncEnqueueEntry): Promise<{ ok: boolean; error?: string }>;
  kiaValidateToken(token: string): Promise<PbSyncValidateResult>;
  kiaFetchFrames(): Promise<PbKiaFetchFramesResult>;
  kiaBundledFrameAsset(
    frameId: number,
    kind: 'thumbnail' | 'frame_image',
  ): Promise<{ ok: boolean; path?: string; error?: string }>;
  kiaEnqueueMedia(
    entry: PbKiaEnqueueMediaEntry,
  ): Promise<{ ok: boolean; error?: string; uploadId?: string; queued?: boolean }>;
  kiaWaitForUpload(
    uploadId: string,
    timeoutMs?: number,
  ): Promise<{ ok: boolean; error?: string; lastPublish?: unknown }>;
  kiaFetchGallery(): Promise<PbKiaFetchGalleryResult>;
  kiaGetUploadQueueStatus(): Promise<PbKiaUploadQueueStatus>;
  kiaTestConnection(): Promise<{ ok: boolean; statusCode?: number; message?: string; error?: string }>;
  onKiaApiDebug(handler: (entry: PbKiaApiDebugEntry) => void): () => void;
}

declare global {
  interface Window {
    pbApi?: PbApi;
  }
}

export {};
