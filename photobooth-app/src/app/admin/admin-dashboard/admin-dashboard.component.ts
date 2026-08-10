import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  PhotoboothAiMode,
  PhotoboothBranding,
  PhotoboothCameraConfig,
  PhotoboothCopy,
  PhotoboothGalleryConfig,
  PhotoboothPrintConfig,
} from '../../models/photobooth-config.model';
import {
  NEWSPAPER_AI_PROMPT,
  DJ_INPAINT_PROMPT,
  DJ_PROMPT_ONLY,
  PHOTOBOOTH_DEFAULT_AI_MODES,
  PHOTOBOOTH_DEFAULT_BRANDING,
  PHOTOBOOTH_DEFAULT_CAMERA,
  PHOTOBOOTH_DEFAULT_COPY,
  PHOTOBOOTH_DEFAULT_GALLERY,
  PHOTOBOOTH_DEFAULT_PRINT,
  PLAIN_PHOTO_MODE_ID,
} from '../../models/photobooth-config.model';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';
import { BoothLogService } from '../../services/booth-log.service';
import { CameraService } from '../../services/camera.service';
import { ThemeService } from '../../services/theme.service';
import { setAdminSession } from '../admin.guard';

interface ThemeListItem {
  id: string;
  folder: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
}

interface AiBackgroundItem {
  filename: string;
  url: string;
}

interface WebcamDeviceOption {
  deviceId: string;
  label: string;
}

interface PrinterOption {
  name: string;
  displayName: string;
  isDefault: boolean;
  driverName?: string;
  portName?: string;
  isIppClass?: boolean;
  isCanonDriver?: boolean;
}

interface AdminFrameItem {
  filename: string;
  label: string;
  url: string;
  /** Shown on the guest frame picker. */
  guestEnabled: boolean;
}

@Component({
  selector: 'pb-admin-dashboard',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  tab: 'copy' | 'themes' | 'branding' | 'camera' | 'frames' | 'gallery' | 'print' | 'ai' = 'copy';
  draft: PhotoboothCopy = structuredClone(PHOTOBOOTH_DEFAULT_COPY);
  draftBranding: PhotoboothBranding = structuredClone(PHOTOBOOTH_DEFAULT_BRANDING);
  draftCamera: PhotoboothCameraConfig = structuredClone(PHOTOBOOTH_DEFAULT_CAMERA);
  draftGallery: PhotoboothGalleryConfig = structuredClone(PHOTOBOOTH_DEFAULT_GALLERY);
  draftPrint: PhotoboothPrintConfig = structuredClone(PHOTOBOOTH_DEFAULT_PRINT);
  activeThemeId = 'default';
  draftAiEnabled = false;
  draftRequireQrUnlock = false;
  draftFramesEnabled = true;
  draftPhotoScale = 1;
  draftDefaultFrameFile: string | null = 'onam-grma-2026.png';
  /** Empty = all frames on disk are offered to guests. */
  draftGuestFrameFiles: string[] = [];
  draftDefaultAiModeId: string | null = null;
  readonly plainPhotoModeId = PLAIN_PHOTO_MODE_ID;
  draftAiModes: PhotoboothAiMode[] = structuredClone(PHOTOBOOTH_DEFAULT_AI_MODES);
  /** Only sent on save when non-empty; replaces stored key. */
  openAiKeyDraft = '';
  hasBridge = signal(false);
  logFilePath = signal<string | null>(null);
  sdkCameras = signal<string[]>([]);
  webcamDevices = signal<WebcamDeviceOption[]>([]);
  printers = signal<PrinterOption[]>([]);
  themes = signal<ThemeListItem[]>([]);
  photoFramesList = signal<AdminFrameItem[]>([]);
  aiBackgrounds = signal<Record<string, AiBackgroundItem[]>>({});
  status = signal<string | null>(null);
  busy = signal(false);

  constructor(
    readonly booth: BoothConfigService,
    readonly branding: BrandingLogoService,
    private readonly camera: CameraService,
    private readonly boothLog: BoothLogService,
    private readonly theme: ThemeService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.syncFromService();
    void this.refreshThemes();
  }

  private syncFromService(): void {
    this.draft = structuredClone(this.booth.copy());
    this.activeThemeId = this.booth.activeThemeId();
    const cfg = this.booth.config();
    this.draftAiEnabled = cfg?.aiGenerationEnabled ?? false;
    this.draftRequireQrUnlock = cfg?.requireQrUnlock ?? false;
    this.draftFramesEnabled = cfg?.photoFrames?.enabled ?? true;
    this.draftPhotoScale = cfg?.photoFrames?.photoScale ?? 1;
    this.draftDefaultFrameFile = cfg?.photoFrames?.defaultFrameFile ?? null;
    this.draftGuestFrameFiles = [...(cfg?.photoFrames?.guestFrameFiles ?? [])];
    this.draftDefaultAiModeId = cfg?.defaultAiModeId ?? null;
    this.draftAiModes = structuredClone(cfg?.aiModes ?? PHOTOBOOTH_DEFAULT_AI_MODES);
    this.draftBranding = structuredClone(cfg?.branding ?? PHOTOBOOTH_DEFAULT_BRANDING);
    this.draftCamera = structuredClone(cfg?.camera ?? PHOTOBOOTH_DEFAULT_CAMERA);
    this.draftGallery = structuredClone(cfg?.gallery ?? PHOTOBOOTH_DEFAULT_GALLERY);
    this.draftPrint = structuredClone(cfg?.print ?? PHOTOBOOTH_DEFAULT_PRINT);
    this.openAiKeyDraft = '';
  }

  setTab(
    t: 'copy' | 'themes' | 'branding' | 'camera' | 'frames' | 'gallery' | 'print' | 'ai',
  ): void {
    this.tab = t;
    if (t === 'themes') {
      void this.refreshThemes();
    }
    if (t === 'branding') {
      void this.branding.refreshAll();
    }
    if (t === 'camera') {
      void this.refreshCameraDevices();
    }
    if (t === 'frames') {
      void this.refreshPhotoFrames();
    }
    if (t === 'print') {
      void this.refreshPrinters();
    }
    if (t === 'ai') {
      void this.refreshAllAiBackgrounds();
    }
  }

  async refreshPhotoFrames(): Promise<void> {
    if (!window.pbApi?.listPhotoFrames) {
      this.photoFramesList.set([]);
      return;
    }
    const r = await window.pbApi.listPhotoFrames();
    if (!r.ok || !r.frames) {
      this.photoFramesList.set([]);
      if (r.error) this.status.set(r.error);
      return;
    }
    const allow = this.draftGuestFrameFiles;
    const showNone = allow.includes('__none__');
    const showAll = allow.length === 0;
    this.photoFramesList.set(
      r.frames.map((f) => ({
        filename: f.filename,
        label: f.label || f.filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        url: f.url,
        guestEnabled: showNone ? false : showAll || allow.includes(f.filename),
      })),
    );
    if (
      this.draftDefaultFrameFile &&
      !this.photoFramesList().some((f) => f.filename === this.draftDefaultFrameFile)
    ) {
      this.draftDefaultFrameFile = this.photoFramesList()[0]?.filename ?? null;
    }
  }

  toggleGuestFrame(filename: string, enabled: boolean): void {
    this.photoFramesList.update((list) =>
      list.map((f) => (f.filename === filename ? { ...f, guestEnabled: enabled } : f)),
    );
    const allOn = this.photoFramesList().every((f) => f.guestEnabled);
    const noneOn = this.photoFramesList().every((f) => !f.guestEnabled);
    if (allOn) {
      this.draftGuestFrameFiles = [];
    } else if (noneOn) {
      this.draftGuestFrameFiles = ['__none__'];
    } else {
      this.draftGuestFrameFiles = this.photoFramesList()
        .filter((f) => f.guestEnabled)
        .map((f) => f.filename);
    }
  }

  selectAllGuestFrames(): void {
    this.photoFramesList.update((list) => list.map((f) => ({ ...f, guestEnabled: true })));
    this.draftGuestFrameFiles = [];
  }

  clearGuestFrames(): void {
    this.photoFramesList.update((list) => list.map((f) => ({ ...f, guestEnabled: false })));
    this.draftGuestFrameFiles = ['__none__'];
  }

  async saveFrames(): Promise<void> {
    this.status.set(null);
    const enabled = this.photoFramesList().filter((f) => f.guestEnabled).map((f) => f.filename);
    let guestFrameFiles: string[];
    if (enabled.length === 0) {
      guestFrameFiles = ['__none__'];
    } else if (enabled.length === this.photoFramesList().length) {
      guestFrameFiles = [];
    } else {
      guestFrameFiles = enabled;
    }
    let defaultFrameFile = this.draftDefaultFrameFile;
    if (defaultFrameFile && enabled.length && !enabled.includes(defaultFrameFile)) {
      defaultFrameFile = enabled[0] ?? null;
    }
    this.busy.set(true);
    try {
      const ok = await this.booth.save({
        photoFrames: {
          enabled: this.draftFramesEnabled,
          photoScale: this.draftPhotoScale,
          defaultFrameFile: defaultFrameFile || null,
          guestFrameFiles,
        },
      });
      if (ok) {
        this.syncFromService();
        await this.refreshPhotoFrames();
        this.status.set('Frame settings saved.');
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  todayGallerySlug(): string {
    const prefix = this.draftGallery.sessionPrefix || 'session';
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${prefix}-${y}-${m}-${day}`;
  }

  todayGalleryUrl(): string {
    const base = (this.draftGallery.apiBaseUrl || '').replace(/\/$/, '');
    return base ? `${base}/${this.todayGallerySlug()}` : '';
  }

  async saveGallery(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({
        gallery: { ...this.draftGallery },
      });
      if (ok) {
        this.syncFromService();
        this.status.set('Gallery settings saved.');
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async refreshPrinters(): Promise<void> {
    if (!window.pbApi?.listPrinters) {
      this.printers.set([]);
      this.status.set('Printer list requires Electron (packaged or electron:dev).');
      return;
    }
    const r = await window.pbApi.listPrinters();
    if (!r.ok || !r.printers) {
      this.printers.set([]);
      if (r.error) this.status.set(r.error);
      return;
    }
    this.printers.set(
      r.printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: !!p.isDefault,
        driverName: p.driverName || '',
        portName: p.portName || '',
        isIppClass: !!p.isIppClass,
        isCanonDriver: !!p.isCanonDriver,
      })),
    );
    if (
      this.draftPrint.printerName &&
      !r.printers.some((p) => p.name === this.draftPrint.printerName)
    ) {
      this.status.set(
        `Saved printer “${this.draftPrint.printerName}” is not currently available. Pick another or use Windows default.`,
      );
    } else {
      const selected = r.printers.find((p) => p.name === this.draftPrint.printerName);
      if (selected?.isIppClass) {
        this.status.set(
          'Selected printer uses Microsoft IPP/WSD — often grayscale + wrong layout. Prefer the USB Canon SELPHY queue, or add Wi‑Fi with the real Canon driver (see notes below).',
        );
      }
    }
  }

  printerLabel(p: PrinterOption): string {
    const tags: string[] = [];
    if (p.isDefault) tags.push('Windows default');
    if (p.isCanonDriver) tags.push('Canon driver');
    if (p.isIppClass) tags.push('IPP — avoid');
    const tag = tags.length ? ` [${tags.join(', ')}]` : '';
    const drv = p.driverName ? ` — ${p.driverName}` : '';
    return `${p.displayName}${tag}${drv}`;
  }

  selectedPrinter(): PrinterOption | null {
    const name = this.draftPrint.printerName;
    if (!name) return null;
    return this.printers().find((p) => p.name === name) ?? null;
  }

  async savePrint(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({
        print: {
          enabled: !!this.draftPrint.enabled,
          printerName: this.draftPrint.printerName?.trim() || null,
          bleedScale: this.draftPrint.bleedScale ?? 1.06,
        },
      });
      if (ok) {
        this.syncFromService();
        const sel = this.selectedPrinter();
        if (this.draftPrint.enabled && sel?.isIppClass) {
          this.status.set(
            'Saved — but this queue is IPP. Expect grayscale/wrong layout until you switch to USB Canon or a Canon TCP/IP queue.',
          );
        } else {
          this.status.set(
            this.draftPrint.enabled
              ? 'Print enabled (SELPHY 6×4, borderless bleed). Guests see a one-shot Print button.'
              : 'Print settings saved (printing disabled).',
          );
        }
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async openWindowsPrinters(): Promise<void> {
    if (!window.pbApi) {
      this.status.set('Open Windows Settings → Printers & scanners manually.');
      return;
    }
    // Reuse logs folder opener pattern — add a dedicated IPC would be nicer; use shell via log for now
    this.status.set(
      'Open Windows Settings → Bluetooth & devices → Printers & scanners. Prefer the USB Canon SELPHY entry, or add Wi‑Fi with Canon’s driver (not “IPP”).',
    );
  }

  async uploadPhotoFrame(): Promise<void> {
    if (!window.pbApi?.adminPickPhotoFrameImage || !window.pbApi.adminInstallPhotoFrame) {
      this.status.set('Frame upload requires Electron.');
      return;
    }
    const pick = await window.pbApi.adminPickPhotoFrameImage();
    if (!pick.ok || pick.canceled || !pick.path) return;
    this.busy.set(true);
    try {
      const inst = await window.pbApi.adminInstallPhotoFrame(pick.path);
      if (inst.ok && inst.filename) {
        // New uploads are guest-enabled by default
        if (this.draftGuestFrameFiles.length && !this.draftGuestFrameFiles.includes('__none__')) {
          this.draftGuestFrameFiles = [...this.draftGuestFrameFiles, inst.filename];
        } else if (this.draftGuestFrameFiles.includes('__none__')) {
          this.draftGuestFrameFiles = [inst.filename];
        }
        if (!this.draftDefaultFrameFile) {
          this.draftDefaultFrameFile = inst.filename;
        }
        await this.refreshPhotoFrames();
        this.status.set(`Uploaded frame ${inst.filename}. Save frame settings to apply guest list.`);
      } else {
        this.status.set(inst.error ?? 'Upload failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async deletePhotoFrame(filename: string): Promise<void> {
    if (!window.pbApi?.adminDeletePhotoFrame) {
      this.status.set('Frame removal requires Electron.');
      return;
    }
    if (!confirm(`Remove frame "${filename}" from this machine?`)) return;
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminDeletePhotoFrame(filename);
      if (r.ok) {
        this.draftGuestFrameFiles = this.draftGuestFrameFiles.filter((f) => f !== filename);
        if (this.draftDefaultFrameFile === filename) {
          this.draftDefaultFrameFile = null;
        }
        await this.refreshPhotoFrames();
        this.status.set(`Removed ${filename}.`);
      } else {
        this.status.set(r.error ?? 'Could not remove frame.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async refreshCameraDevices(): Promise<void> {
    const paths = await this.camera.getPaths();
    this.hasBridge.set(!!paths?.hasBridge);
    this.logFilePath.set(paths?.logFile ?? null);
    await this.boothLog.info('admin', 'refreshCameraDevices', {
      hasBridge: !!paths?.hasBridge,
      logFile: paths?.logFile,
    });

    if (paths?.hasBridge) {
      const list = await this.camera.listSdkCameras();
      if (list.ok) {
        this.sdkCameras.set(list.cameras);
        if (list.cameras.length > 0 && this.draftCamera.sdkCameraIndex >= list.cameras.length) {
          this.draftCamera = { ...this.draftCamera, sdkCameraIndex: 0 };
        }
      } else {
        this.sdkCameras.set([]);
        if (list.error) {
          this.status.set(`Canon SDK: ${list.error}`);
        }
      }
    } else {
      this.sdkCameras.set([]);
    }

    await this.refreshWebcamDevices();
  }

  private async refreshWebcamDevices(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      this.webcamDevices.set([]);
      return;
    }
    try {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch {
        /* labels may be empty without permission */
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label?.trim() || `Camera ${i + 1}`,
        }));
      this.webcamDevices.set(cams);
      if (
        this.draftCamera.webcamDeviceId &&
        !cams.some((c) => c.deviceId === this.draftCamera.webcamDeviceId)
      ) {
        this.draftCamera = { ...this.draftCamera, webcamDeviceId: null };
      }
      stream?.getTracks().forEach((t) => t.stop());
    } catch (e) {
      this.webcamDevices.set([]);
      this.status.set(`Webcam list failed: ${String(e)}`);
    }
  }

  async openLogsFolder(): Promise<void> {
    const r = await this.boothLog.openLogsFolder();
    if (r.ok) {
      this.status.set(`Opened logs folder: ${r.path}`);
    } else {
      this.status.set(
        `Could not open folder. Check logs\\photobooth.log next to the app. (${r.error ?? ''})`,
      );
    }
  }

  async saveCamera(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const sdkIndex = Math.max(0, Math.floor(this.draftCamera.sdkCameraIndex ?? 0));
      const ok = await this.booth.save({
        camera: {
          source: this.draftCamera.source,
          sdkCameraIndex: sdkIndex,
          webcamDeviceId: this.draftCamera.webcamDeviceId || null,
        },
      });
      if (ok) {
        this.syncFromService();
        this.status.set('Camera settings saved. New sessions use this device on next capture.');
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async testOpenAiKey(): Promise<void> {
    if (!window.pbApi?.adminTestOpenAiKey) {
      this.status.set('API key test requires Electron.');
      return;
    }
    this.status.set(null);
    this.busy.set(true);
    try {
      const draft = this.openAiKeyDraft.trim();
      const r = await window.pbApi.adminTestOpenAiKey(draft || undefined);
      if (r.ok) {
        this.status.set(r.message ?? 'API key is valid.');
      } else {
        this.status.set(r.error ?? 'API key test failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  addAiMode(): void {
    const id = `mode_${Date.now()}`;
    this.draftAiModes = [
      ...this.draftAiModes,
      { id, label: 'New mode', prompt: '', useInpainting: false, randomizeBackground: true },
    ];
  }

  addDjMode(): void {
    if (this.draftAiModes.some((m) => m.id === 'dj')) {
      this.status.set('DJ mode already exists.');
      return;
    }
    this.draftAiModes = [
      {
        id: 'dj',
        label: 'DJ',
        prompt: DJ_PROMPT_ONLY,
        useInpainting: true,
        randomizeBackground: true,
        inpaintPrompt: DJ_INPAINT_PROMPT,
      },
      ...this.draftAiModes,
    ];
    this.draftDefaultAiModeId = 'dj';
    this.draftAiEnabled = true;
  }

  removeAiMode(index: number): void {
    this.draftAiModes = this.draftAiModes.filter((_, i) => i !== index);
  }

  /** Paste the built-in Newspaper prompt into a row (same text as default config). */
  applyNewspaperPrompt(index: number): void {
    const next = [...this.draftAiModes];
    const row = next[index];
    if (!row) return;
    next[index] = { ...row, prompt: NEWSPAPER_AI_PROMPT };
    this.draftAiModes = next;
  }

  applyDjInpaintPrompt(index: number): void {
    const next = [...this.draftAiModes];
    const row = next[index];
    if (!row) return;
    next[index] = {
      ...row,
      useInpainting: true,
      randomizeBackground: true,
      inpaintPrompt: DJ_INPAINT_PROMPT,
    };
    this.draftAiModes = next;
  }

  async refreshAiBackgrounds(modeId: string): Promise<void> {
    if (!window.pbApi?.adminListAiBackgrounds || !modeId.trim()) return;
    const r = await window.pbApi.adminListAiBackgrounds(modeId.trim());
    if (r.ok && r.backgrounds) {
      this.aiBackgrounds.update((prev) => ({ ...prev, [modeId.trim()]: r.backgrounds! }));
    }
  }

  async refreshAllAiBackgrounds(): Promise<void> {
    for (const m of this.draftAiModes) {
      if (m.useInpainting) {
        await this.refreshAiBackgrounds(m.id);
      }
    }
  }

  backgroundsForMode(modeId: string): AiBackgroundItem[] {
    return this.aiBackgrounds()[modeId] ?? [];
  }

  async uploadAiBackground(modeId: string): Promise<void> {
    if (!window.pbApi?.adminPickAiBackgroundImage || !window.pbApi.adminInstallAiBackground) {
      this.status.set('Background upload requires Electron.');
      return;
    }
    const pick = await window.pbApi.adminPickAiBackgroundImage();
    if (!pick.ok || pick.canceled || !pick.path) return;
    this.busy.set(true);
    try {
      const inst = await window.pbApi.adminInstallAiBackground(modeId, pick.path);
      if (inst.ok) {
        await this.refreshAiBackgrounds(modeId);
        this.status.set(`Background uploaded for ${modeId}.`);
      } else {
        this.status.set(inst.error ?? 'Upload failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async deleteAiBackground(modeId: string, filename: string): Promise<void> {
    if (!window.pbApi?.adminDeleteAiBackground) {
      this.status.set('Background removal requires Electron.');
      return;
    }
    if (!confirm(`Remove background "${filename}" from mode ${modeId}?`)) return;
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminDeleteAiBackground(modeId, filename);
      if (r.ok) {
        await this.refreshAiBackgrounds(modeId);
        this.status.set(`Removed ${filename}.`);
      } else {
        this.status.set(r.error ?? 'Could not remove background.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async saveAi(): Promise<void> {
    this.status.set(null);
    const normalized = this.draftAiModes
      .map((m) => ({
        id: m.id.trim(),
        label: m.label.trim(),
        prompt: m.prompt.trim(),
        useInpainting: m.useInpainting === true,
        randomizeBackground: m.randomizeBackground !== false,
        inpaintPrompt: m.inpaintPrompt?.trim() || undefined,
      }))
      .filter((m) => m.id.length > 0 && m.label.length > 0 && m.prompt.length > 0);
    if (normalized.length === 0) {
      this.status.set('Add at least one mode with id, label, and prompt.');
      return;
    }
    let defaultId: string | null = this.draftDefaultAiModeId;
    if (defaultId === PLAIN_PHOTO_MODE_ID) {
      // plain-only default is valid
    } else if (defaultId && !normalized.some((m) => m.id === defaultId)) {
      this.status.set('Default mode must match a mode id below, or choose Guest chooses.');
      return;
    }
    let aiEnabled = this.draftAiEnabled;
    if (defaultId && defaultId !== PLAIN_PHOTO_MODE_ID && !aiEnabled) {
      aiEnabled = true;
    }
    const inpaintModes = normalized.filter((m) => m.useInpainting);
    this.busy.set(true);
    try {
      const payload: Record<string, unknown> = {
        aiGenerationEnabled: aiEnabled,
        requireQrUnlock: this.draftRequireQrUnlock,
        defaultAiModeId: defaultId,
        aiModes: normalized.map(({ inpaintPrompt, useInpainting, randomizeBackground, ...rest }) => ({
          ...rest,
          ...(useInpainting
            ? {
                useInpainting: true,
                randomizeBackground,
                ...(inpaintPrompt ? { inpaintPrompt } : {}),
              }
            : {}),
        })),
      };
      if (this.openAiKeyDraft.trim()) {
        payload['openAiApiKey'] = this.openAiKeyDraft.trim();
      }
      const ok = await this.booth.save(payload);
      if (ok) {
        this.openAiKeyDraft = '';
        this.draftAiEnabled = aiEnabled;
        await this.refreshAllAiBackgrounds();
        const missingBg = inpaintModes.filter((m) => this.backgroundsForMode(m.id).length === 0);
        if (missingBg.length) {
          this.status.set(
            `AI settings saved. Upload backgrounds for: ${missingBg.map((m) => m.id).join(', ')}.`,
          );
        } else {
          this.status.set('AI settings saved.');
        }
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async clearOpenAiKey(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({ openAiApiKey: '' });
      if (ok) {
        await this.booth.load();
        this.syncFromService();
        this.status.set('OpenAI API key removed from this machine.');
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async refreshThemes(): Promise<void> {
    if (!window.pbApi?.adminListThemes) {
      return;
    }
    const r = await window.pbApi.adminListThemes();
    if (r.ok && r.themes) {
      this.themes.set(r.themes as ThemeListItem[]);
    }
  }

  async saveCopy(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({ copy: this.draft });
      this.status.set(ok ? 'Copy saved.' : 'Save failed (run in Electron).');
    } finally {
      this.busy.set(false);
    }
  }

  async saveThemeSelection(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({ activeThemeId: this.activeThemeId });
      if (ok) {
        await this.theme.applyFromConfig();
        this.status.set('Theme updated.');
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async installZip(): Promise<void> {
    if (!window.pbApi?.adminPickThemeZip || !window.pbApi.adminInstallThemeFromZip) {
      this.status.set('Theme upload requires Electron.');
      return;
    }
    this.status.set(null);
    const pick = await window.pbApi.adminPickThemeZip();
    if (!pick.ok || pick.canceled || !pick.path) {
      return;
    }
    this.busy.set(true);
    try {
      const inst = await window.pbApi.adminInstallThemeFromZip(pick.path);
      if (inst.ok && inst.id) {
        this.activeThemeId = inst.id;
        await this.booth.save({ activeThemeId: inst.id });
        await this.booth.load();
        await this.theme.applyFromConfig();
        await this.refreshThemes();
        this.status.set(`Installed theme “${inst.id}”.`);
      } else {
        this.status.set(inst.error ?? 'Install failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async exportTemplate(): Promise<void> {
    this.status.set(null);
    if (!window.pbApi?.adminExportThemeTemplate) {
      this.status.set('Export requires Electron.');
      return;
    }
    const r = await window.pbApi.adminExportThemeTemplate();
    if (r.ok && r.path) {
      this.status.set(`Saved zip to: ${r.path}`);
    } else {
      this.status.set(r.error ?? 'Export failed.');
    }
  }

  async downloadSelectedTheme(): Promise<void> {
    this.status.set(null);
    if (!window.pbApi?.adminExportThemeZip) {
      this.status.set('Theme download requires Electron.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminExportThemeZip(this.activeThemeId);
      if (r.ok && r.path) {
        this.status.set(`Saved theme zip to: ${r.path}`);
      } else {
        this.status.set(r.error ?? 'Export failed.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async removeSelectedTheme(): Promise<void> {
    if (this.activeThemeId === 'default') {
      return;
    }
    if (
      !confirm(
        `Remove theme "${this.activeThemeId}" from this machine? This deletes the theme folder. Continue?`,
      )
    ) {
      return;
    }
    if (!window.pbApi?.adminDeleteTheme) {
      this.status.set('Removing themes requires Electron.');
      return;
    }
    this.status.set(null);
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminDeleteTheme(this.activeThemeId);
      if (r.ok) {
        await this.booth.load();
        this.syncFromService();
        await this.theme.applyFromConfig();
        await this.refreshThemes();
        const extra = r.switchedActiveToDefault ? ' Switched active theme to default.' : '';
        this.status.set(`Theme “${r.removedId ?? this.activeThemeId}” removed.${extra}`);
      } else {
        this.status.set(r.error ?? 'Could not remove theme.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async saveBranding(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({
        branding: {
          brandName: this.draftBranding.brandName?.trim() || null,
          applyBrandToAi: this.draftBranding.applyBrandToAi,
        },
      });
      if (ok) {
        this.syncFromService();
        await this.branding.refreshAll();
        this.status.set('Brand settings saved.');
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async uploadLogo(): Promise<void> {
    if (!window.pbApi?.adminPickLogoImage || !window.pbApi.adminInstallLogo) {
      this.status.set('Logo upload requires Electron.');
      return;
    }
    this.status.set(null);
    const pick = await window.pbApi.adminPickLogoImage();
    if (!pick.ok || pick.canceled || !pick.path) {
      return;
    }
    this.busy.set(true);
    try {
      const inst = await window.pbApi.adminInstallLogo(pick.path);
      if (inst.ok && inst.logoFile) {
        await this.booth.load();
        await this.branding.refresh();
        this.status.set(`App logo saved (${inst.logoFile}).`);
      } else {
        this.status.set(inst.error ?? 'Could not save logo.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async removeLogo(): Promise<void> {
    if (!window.pbApi?.adminClearLogo) {
      this.status.set('Logo removal requires Electron.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminClearLogo();
      if (r.ok) {
        await this.booth.load();
        await this.branding.refresh();
        this.status.set('App logo removed; emoji icons restored.');
      } else {
        this.status.set(r.error ?? 'Could not remove logo.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async uploadAiLogo(): Promise<void> {
    if (!window.pbApi?.adminPickAiLogoImage || !window.pbApi.adminInstallAiLogo) {
      this.status.set('AI logo upload requires Electron.');
      return;
    }
    this.status.set(null);
    const pick = await window.pbApi.adminPickAiLogoImage();
    if (!pick.ok || pick.canceled || !pick.path) {
      return;
    }
    this.busy.set(true);
    try {
      const inst = await window.pbApi.adminInstallAiLogo(pick.path);
      if (inst.ok && inst.aiLogoFile) {
        await this.booth.load();
        await this.branding.refreshAiLogo();
        this.status.set(`AI reference logo saved (${inst.aiLogoFile}).`);
      } else {
        this.status.set(inst.error ?? 'Could not save AI logo.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async removeAiLogo(): Promise<void> {
    if (!window.pbApi?.adminClearAiLogo) {
      this.status.set('AI logo removal requires Electron.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.pbApi.adminClearAiLogo();
      if (r.ok) {
        await this.booth.load();
        await this.branding.refreshAiLogo();
        this.status.set('AI reference logo removed.');
      } else {
        this.status.set(r.error ?? 'Could not remove AI logo.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async reloadConfig(): Promise<void> {
    await this.booth.load();
    this.syncFromService();
    await this.theme.applyFromConfig();
    await this.branding.refreshAll();
    this.status.set('Reloaded from disk.');
  }

  logout(): void {
    setAdminSession(false);
    void this.router.navigate(['/admin/login']);
  }
}
