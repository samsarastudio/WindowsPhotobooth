import type { PhotoboothScannerConfig, QrScanMode } from '../models/photobooth-config.model';

function normalizeQrScanMode(raw: unknown): QrScanMode {
  if (raw === 'camera' || raw === 'serial' || raw === 'auto') return raw;
  return 'auto';
}

/** True when the Electron main process should open the serial COM port. */
export function shouldStartSerialScanner(scanner: PhotoboothScannerConfig): boolean {
  const mode = normalizeQrScanMode(scanner.qrScanMode);
  if (mode === 'camera') return false;
  return scanner.enabled && !!scanner.comPort.trim();
}

/** True when the QR screen should show the camera-based QR reader. */
export function shouldUseCameraQr(
  scanner: PhotoboothScannerConfig,
  serialStatus: string,
): boolean {
  const mode = normalizeQrScanMode(scanner.qrScanMode);
  if (mode === 'camera') return true;
  if (mode === 'serial') return false;
  if (!scanner.cameraQrFallbackEnabled) return false;
  if (!scanner.enabled || !scanner.comPort.trim()) return true;
  return serialStatus !== 'connected';
}
