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
  error?: string;
  message?: string | null;
  statusCode?: number;
}

export interface PbSyncEnqueueEntry {
  token: string;
  photos: string[];
}

export interface PbApi {
  getPaths(): Promise<PbPaths>;
  cameraInvoke(cmd: Record<string, unknown>): Promise<PbCameraResult>;
  readFileBase64(filePath: string): Promise<string>;
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
}

declare global {
  interface Window {
    pbApi?: PbApi;
  }
}

export {};
