export interface PbPaths {
  portableRoot: string;
  captureDir: string;
  hasBridge: boolean;
}

export interface PbCameraResult {
  ok: boolean;
  err?: number | string;
  msg?: string;
  path?: string;
  cameras?: string[];
  /** Electron adds file:// URL for live preview (avoid base64 each frame). */
  previewFileUrl?: string | null;
  imageBase64?: string | null;
  readErr?: string;
}

export interface PbApi {
  getPaths(): Promise<PbPaths>;
  cameraInvoke(cmd: Record<string, unknown>): Promise<PbCameraResult>;
  readFileBase64(filePath: string): Promise<string>;
  saveJpeg(fullPath: string, base64Body: string): Promise<{ ok: boolean; path?: string }>;
}

declare global {
  interface Window {
    pbApi?: PbApi;
  }
}
