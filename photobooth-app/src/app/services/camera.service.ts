import { Injectable } from '@angular/core';
import type { PbCameraResult, PbPaths } from '../../types/pb-api';

@Injectable({ providedIn: 'root' })
export class CameraService {
  normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
  }

  hasApi(): boolean {
    return typeof window !== 'undefined' && !!window.pbApi;
  }

  async getPaths(): Promise<PbPaths | undefined> {
    return window.pbApi?.getPaths();
  }

  async initAndOpenFirstCamera(): Promise<{ previewBasePath: string; useWebcam: boolean; lastError?: string }> {
    if (!this.hasApi()) {
      return { previewBasePath: '', useWebcam: true };
    }
    const paths = await window.pbApi!.getPaths();
    const previewFile = `${this.normalizePath(paths.captureDir)}/_live_preview.jpg`;
    if (!paths.hasBridge) {
      return { previewBasePath: previewFile, useWebcam: true, lastError: 'EDS bridge .exe not placed next to app' };
    }
    const initR = await window.pbApi!.cameraInvoke({ cmd: 'init' });
    if (!initR.ok) {
      return {
        previewBasePath: previewFile,
        useWebcam: true,
        lastError: initR.msg ?? String(initR.err ?? 'init'),
      };
    }
    const openR = await window.pbApi!.cameraInvoke({ cmd: 'open', index: 0 });
    if (!openR.ok) {
      return {
        previewBasePath: previewFile,
        useWebcam: true,
        lastError: openR.msg ?? String(openR.err ?? 'open'),
      };
    }
    return { previewBasePath: previewFile, useWebcam: false };
  }

  async previewFrame(outPath: string): Promise<PbCameraResult> {
    return window.pbApi!.cameraInvoke({
      cmd: 'preview',
      path: this.normalizePath(outPath),
    });
  }

  async capture(outPath: string): Promise<PbCameraResult> {
    return window.pbApi!.cameraInvoke({
      cmd: 'capture',
      path: this.normalizePath(outPath),
    });
  }

  async closeSession(): Promise<void> {
    await window.pbApi?.cameraInvoke({ cmd: 'close' });
  }
}
