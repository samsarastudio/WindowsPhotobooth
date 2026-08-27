import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  PhotoboothAiMode,
  PhotoboothGuestModesConfig,
  PhotoboothBranding,
  PhotoboothCameraConfig,
  PhotoboothCopy,
  PhotoboothDebugConfig,
  PhotoboothGalleryConfig,
  PhotoboothPhysicalFrameConfig,
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
  PHOTOBOOTH_DEFAULT_DEBUG,
  PHOTOBOOTH_DEFAULT_GALLERY,
  PHOTOBOOTH_DEFAULT_GUEST_MODES,
  PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME,
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
  isUsb?: boolean;
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
  tab:
    | 'copy'
    | 'themes'
    | 'branding'
    | 'camera'
    | 'frames'
    | 'modes'
    | 'gallery'
    | 'print'
    | 'ai'
    | 'system'
    | 'debug' = 'copy';
  draft: PhotoboothCopy = structuredClone(PHOTOBOOTH_DEFAULT_COPY);
  draftBranding: PhotoboothBranding = structuredClone(PHOTOBOOTH_DEFAULT_BRANDING);
  draftCamera: PhotoboothCameraConfig = structuredClone(PHOTOBOOTH_DEFAULT_CAMERA);
  draftGallery: PhotoboothGalleryConfig = structuredClone(PHOTOBOOTH_DEFAULT_GALLERY);
  draftPrint: PhotoboothPrintConfig = structuredClone(PHOTOBOOTH_DEFAULT_PRINT);
  draftDebug: PhotoboothDebugConfig = structuredClone(PHOTOBOOTH_DEFAULT_DEBUG);
  draftGuestModes: PhotoboothGuestModesConfig = structuredClone(PHOTOBOOTH_DEFAULT_GUEST_MODES);
  draftPhysicalFrame: PhotoboothPhysicalFrameConfig = structuredClone(
    PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME,
  );
  installRootLabel = signal<string | null>(null);
  activeThemeId = 'default';
  draftAiEnabled = false;
  draftRequireQrUnlock = false;
  draftFramesEnabled = true;
  draftAutoApplyFrame = false;
  draftGuestTextEnabled = false;
  draftGuestTextOptional = true;
  draftGuestTextMaxLength = 36;
  draftGuestTextCreditLine = 'by inmoment photography';
  draftGuestTextXPercent = 50;
  draftGuestTextYPercent = 78;
  draftGuestTextSizePercent = 3.4;
  draftGuestTextColor = '#c9a36a';
  draftGuestTextCreditColor = '#d8c4a0';
  draftGuestTextAlign: 'left' | 'center' | 'right' = 'center';
  draftGuestTextBrush = false;
  draftGuestTextBrushOpacity = 0.22;
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
  appVersionLabel = signal('…');
  canSelfUpdate = signal(false);
  updateBusy = signal(false);
  pendingUpdateLabel = signal<string | null>(null);
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
    readonly boothLog: BoothLogService,
    private readonly theme: ThemeService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.syncFromService();
    void this.refreshThemes();
    void this.refreshAppVersion();
  }

  async refreshAppVersion(): Promise<void> {
    try {
      if (window.pbApi?.getVersion) {
        const r = await window.pbApi.getVersion();
        if (r.ok) {
          const build = r.buildId ? ` · build ${r.buildId}` : '';
          const ch = r.channel ? ` · ${r.channel}` : '';
          this.appVersionLabel.set(`v${r.version || '?'}${build}${ch}`);
          this.canSelfUpdate.set(!!r.canSelfUpdate);
          this.installRootLabel.set(r.installRoot || null);
          return;
        }
      }
      const paths = await window.pbApi?.getPaths?.();
      if (paths?.appVersion) {
        const build = paths.appBuildId ? ` · build ${paths.appBuildId}` : '';
        this.appVersionLabel.set(`v${paths.appVersion}${build}`);
        this.canSelfUpdate.set(!!paths.canSelfUpdate);
        this.installRootLabel.set(paths.portableRoot || null);
      } else {
        this.appVersionLabel.set('unknown');
        this.installRootLabel.set(null);
      }
    } catch {
      this.appVersionLabel.set('unknown');
      this.installRootLabel.set(null);
    }
  }

  async checkBoothUpdateNow(): Promise<void> {
    if (!window.pbApi?.checkBoothUpdate) {
      this.status.set('Update check requires Electron Folder build.');
      return;
    }
    this.updateBusy.set(true);
    this.status.set(null);
    this.pendingUpdateLabel.set(null);
    try {
      const r = await window.pbApi.checkBoothUpdate({ apply: false });
      if (r.skipped) {
        this.status.set(`Update check skipped (${r.reason || 'n/a'}).`);
        return;
      }
      if (!r.ok) {
        this.status.set(r.error || 'Update check failed.');
        return;
      }
      if (r.updateAvailable && r.release) {
        const build = r.release.buildId ? ` (${r.release.buildId})` : '';
        this.pendingUpdateLabel.set(`v${r.release.version}${build}`);
        this.status.set(`Update available: v${r.release.version}. Tap Install when ready.`);
        return;
      }
      this.status.set(
        r.active
          ? `Up to date (rolled out v${r.active.version}).`
          : 'No roll-out active on Moments.',
      );
    } catch (e) {
      this.status.set(String(e));
    } finally {
      this.updateBusy.set(false);
      void this.refreshAppVersion();
    }
  }

  async installBoothUpdateNow(): Promise<void> {
    if (!window.pbApi?.checkBoothUpdate) {
      this.status.set('Install requires Electron Folder build.');
      return;
    }
    const label = this.pendingUpdateLabel() || 'the available update';
    if (
      !confirm(
        `Install ${label} now?\n\nPhotoBooth will quit, replace files, and relaunch. Config, captures, and data are kept.`,
      )
    ) {
      return;
    }
    this.updateBusy.set(true);
    this.status.set('Downloading update…');
    try {
      const r = await window.pbApi.checkBoothUpdate({ apply: true });
      if (r.applying) {
        this.status.set(
          `Updating to v${r.release?.version || '?'} — app will close and relaunch…`,
        );
        return;
      }
      if (r.skipped) {
        this.status.set(`Install skipped (${r.reason || 'n/a'}).`);
        return;
      }
      if (!r.ok) {
        this.status.set(r.error || 'Install failed.');
        return;
      }
      if (r.updateAvailable === false) {
        this.pendingUpdateLabel.set(null);
        this.status.set('No update to install.');
        return;
      }
      this.status.set('Unexpected update response.');
    } catch (e) {
      this.status.set(String(e));
    } finally {
      this.updateBusy.set(false);
      void this.refreshAppVersion();
    }
  }

  private syncFromService(): void {
    this.draft = structuredClone(this.booth.copy());
    this.activeThemeId = this.booth.activeThemeId();
    const cfg = this.booth.config();
    this.draftAiEnabled = cfg?.aiGenerationEnabled ?? false;
    this.draftRequireQrUnlock = cfg?.requireQrUnlock ?? false;
    this.draftFramesEnabled = cfg?.photoFrames?.enabled ?? true;
    this.draftAutoApplyFrame = cfg?.photoFrames?.autoApplyFrame ?? false;
    this.draftGuestTextEnabled = cfg?.photoFrames?.guestTextEnabled ?? false;
    this.draftGuestTextOptional = cfg?.photoFrames?.guestTextOptional ?? true;
    this.draftGuestTextMaxLength = cfg?.photoFrames?.guestTextMaxLength ?? 36;
    this.draftGuestTextCreditLine = cfg?.photoFrames?.guestTextCreditLine ?? 'by inmoment photography';
    this.draftGuestTextXPercent = cfg?.photoFrames?.guestTextXPercent ?? 50;
    this.draftGuestTextYPercent = cfg?.photoFrames?.guestTextYPercent ?? 78;
    this.draftGuestTextSizePercent = cfg?.photoFrames?.guestTextSizePercent ?? 3.4;
    this.draftGuestTextColor = cfg?.photoFrames?.guestTextColor ?? '#c9a36a';
    this.draftGuestTextCreditColor = cfg?.photoFrames?.guestTextCreditColor ?? '#d8c4a0';
    this.draftGuestTextAlign = cfg?.photoFrames?.guestTextAlign ?? 'center';
    this.draftGuestTextBrush = cfg?.photoFrames?.guestTextBrush ?? false;
    this.draftGuestTextBrushOpacity = cfg?.photoFrames?.guestTextBrushOpacity ?? 0.22;
    this.draftPhotoScale = cfg?.photoFrames?.photoScale ?? 1;
    this.draftDefaultFrameFile = cfg?.photoFrames?.defaultFrameFile ?? null;
    this.draftGuestFrameFiles = [...(cfg?.photoFrames?.guestFrameFiles ?? [])];
    this.draftDefaultAiModeId = cfg?.defaultAiModeId ?? null;
    this.draftAiModes = structuredClone(cfg?.aiModes ?? PHOTOBOOTH_DEFAULT_AI_MODES);
    this.draftBranding = structuredClone(cfg?.branding ?? PHOTOBOOTH_DEFAULT_BRANDING);
    this.draftCamera = structuredClone(cfg?.camera ?? PHOTOBOOTH_DEFAULT_CAMERA);
    this.draftGallery = structuredClone(cfg?.gallery ?? PHOTOBOOTH_DEFAULT_GALLERY);
    this.draftPrint = structuredClone(cfg?.print ?? PHOTOBOOTH_DEFAULT_PRINT);
    this.draftDebug = structuredClone(cfg?.debug ?? PHOTOBOOTH_DEFAULT_DEBUG);
    this.draftGuestModes = structuredClone(cfg?.guestModes ?? PHOTOBOOTH_DEFAULT_GUEST_MODES);
    this.draftPhysicalFrame = structuredClone(
      cfg?.physicalFrame ?? PHOTOBOOTH_DEFAULT_PHYSICAL_FRAME,
    );
    this.openAiKeyDraft = '';
  }

  setTab(
    t:
      | 'copy'
      | 'themes'
      | 'branding'
      | 'camera'
      | 'frames'
      | 'modes'
      | 'gallery'
      | 'print'
      | 'ai'
      | 'system'
      | 'debug',
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
      void this.refreshPhotoFramesAndSync();
    }
    if (t === 'system') {
      void this.refreshAppVersion();
    }
    if (t === 'print') {
      void this.refreshPrinters();
    }
    if (t === 'ai') {
      void this.refreshAllAiBackgrounds();
    }
    if (t === 'debug') {
      void this.refreshDebugPanel();
    }
  }

  async saveModes(): Promise<void> {
    this.busy.set(true);
    this.status.set(null);
    try {
      if (!this.draftGuestModes.defaultEnabled && !this.draftGuestModes.physicalFrameEnabled) {
        this.draftGuestModes.defaultEnabled = true;
      }
      const ok = await this.booth.save({
        guestModes: { ...this.draftGuestModes },
        physicalFrame: { ...this.draftPhysicalFrame },
      });
      const parts: string[] = [];
      if (this.draftGuestModes.defaultEnabled) parts.push('Digital frame');
      if (this.draftGuestModes.physicalFrameEnabled) parts.push('Physical frame');
      this.status.set(
        ok
          ? `Modes saved — guests can choose: ${parts.join(' · ')}.`
          : 'Failed to save modes.',
      );
      this.syncFromService();
    } finally {
      this.busy.set(false);
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

  captionDragActive = false;

  get captionPreviewFrameUrl(): string | null {
    const file = this.draftDefaultFrameFile;
    const list = this.photoFramesList();
    const hit = file ? list.find((f) => f.filename === file) : list.find((f) => f.guestEnabled) || list[0];
    return hit?.url ?? null;
  }

  get captionPreviewSizeEm(): number {
    return Math.max(0.7, Number(this.draftGuestTextSizePercent) / 3.4);
  }

  get captionBrushOpacityPct(): number {
    return Math.round(Number(this.draftGuestTextBrushOpacity) * 100);
  }

  startCaptionPreviewDrag(ev: PointerEvent): void {
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture?.(ev.pointerId);
    this.captionDragActive = true;
    this.applyCaptionPreviewPoint(ev, el);
  }

  moveCaptionPreviewDrag(ev: PointerEvent): void {
    if (!this.captionDragActive) return;
    this.applyCaptionPreviewPoint(ev, ev.currentTarget as HTMLElement);
  }

  endCaptionPreviewDrag(): void {
    this.captionDragActive = false;
  }

  private applyCaptionPreviewPoint(ev: PointerEvent, el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const x = ((ev.clientX - r.left) / r.width) * 100;
    const y = ((ev.clientY - r.top) / r.height) * 100;
    this.draftGuestTextXPercent = Math.round(Math.min(100, Math.max(0, x)));
    this.draftGuestTextYPercent = Math.round(Math.min(100, Math.max(0, y)));
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
          autoApplyFrame: this.draftFramesEnabled && this.draftAutoApplyFrame,
          photoScale: this.draftPhotoScale,
          defaultFrameFile: defaultFrameFile || null,
          guestFrameFiles,
          guestTextEnabled: this.draftFramesEnabled && this.draftGuestTextEnabled,
          guestTextOptional: this.draftGuestTextOptional,
          guestTextMaxLength: this.draftGuestTextMaxLength,
          guestTextCreditLine: this.draftGuestTextCreditLine,
          guestTextXPercent: Number(this.draftGuestTextXPercent),
          guestTextYPercent: Number(this.draftGuestTextYPercent),
          guestTextSizePercent: Number(this.draftGuestTextSizePercent),
          guestTextColor: this.draftGuestTextColor,
          guestTextCreditColor: this.draftGuestTextCreditColor,
          guestTextAlign: this.draftGuestTextAlign,
          guestTextBrush: this.draftGuestTextBrush,
          guestTextBrushOpacity: Number(this.draftGuestTextBrushOpacity),
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

  momentsWallUrl(): string {
    const base = (this.draftGallery.apiBaseUrl || '').replace(/\/$/, '');
    return base ? `${base}/wall` : '';
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
        isUsb: p.isUsb !== false,
      })),
    );
    if (
      this.draftPrint.printerName &&
      !r.printers.some((p) => p.name === this.draftPrint.printerName)
    ) {
      this.draftPrint.printerName = null;
      this.status.set(
        `Saved printer was not a USB queue (or is offline). Switched to Auto — plug in SELPHY USB and Refresh if needed.`,
      );
    } else if (!r.printers.length) {
      this.status.set('No USB printers found. Connect the SELPHY by USB, then Refresh.');
    } else {
      this.status.set(
        `${r.printers.length} USB printer${r.printers.length === 1 ? '' : 's'} available.`,
      );
    }
  }

  printerLabel(p: PrinterOption): string {
    const tags: string[] = [];
    if (p.isDefault) tags.push('Windows default');
    if (p.isCanonDriver) tags.push('Canon');
    if (p.portName) tags.push(p.portName);
    const tag = tags.length ? ` [${tags.join(', ')}]` : '';
    return `${p.displayName}${tag}`;
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
        this.status.set(
          this.draftPrint.enabled
            ? this.draftPrint.printerName
              ? `Print enabled → ${this.draftPrint.printerName} (USB).`
              : 'Print enabled → Auto USB Canon/SELPHY.'
            : 'Print settings saved (printing disabled).',
        );
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
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
        const published = await this.publishFrameQuiet(inst.filename);
        this.status.set(
          published
            ? `Uploaded and published ${inst.filename} to Moments.`
            : `Uploaded frame ${inst.filename}. Save frame settings to apply guest list.`,
        );
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
        const creds = this.momentsGalleryCreds();
        if (creds?.uploadToken && window.pbApi.galleryDeleteRemoteFrame) {
          await window.pbApi.galleryDeleteRemoteFrame({
            apiBaseUrl: creds.apiBaseUrl,
            uploadToken: creds.uploadToken,
            filename,
          });
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

  private momentsGalleryCreds(): { apiBaseUrl: string; uploadToken: string } | null {
    const g = this.draftGallery?.apiBaseUrl
      ? this.draftGallery
      : this.booth.gallery();
    const apiBaseUrl = (g.apiBaseUrl || '').replace(/\/$/, '');
    const uploadToken = g.uploadToken || '';
    if (!apiBaseUrl) return null;
    return { apiBaseUrl, uploadToken };
  }

  private async publishFrameQuiet(filename: string): Promise<boolean> {
    const creds = this.momentsGalleryCreds();
    if (!creds?.uploadToken || !window.pbApi?.galleryPublishFrame) return false;
    const r = await window.pbApi.galleryPublishFrame({
      apiBaseUrl: creds.apiBaseUrl,
      uploadToken: creds.uploadToken,
      filename,
    });
    return !!r.ok;
  }

  /** Pull Moments frames; drop local overlays that were removed on the server. */
  private async mirrorFramesWithMoments(quiet = false): Promise<boolean> {
    const creds = this.momentsGalleryCreds();
    if (!creds || !window.pbApi?.gallerySyncFrames) return false;
    const r = await window.pbApi.gallerySyncFrames({
      apiBaseUrl: creds.apiBaseUrl,
      uploadToken: creds.uploadToken || undefined,
      pushLocal: false,
      pruneLocal: true,
      timeoutMs: 20000,
    });
    if (!quiet) {
      if (r.ok) {
        const pruned = r.prunedCount ?? r.pruned?.length ?? 0;
        this.status.set(
          `Synced with Moments: pulled ${r.count ?? 0}, already current ${r.skippedCount ?? 0}, removed ${pruned} local` +
            (r.failed?.length ? ` (${r.failed.length} failed)` : '') +
            '.',
        );
      } else if (r.offline) {
        this.status.set('Moments unreachable — keeping local frames. Booth stays online.');
      } else {
        this.status.set(r.error ?? 'Sync failed.');
      }
    }
    return !!r.ok;
  }

  async refreshPhotoFramesAndSync(): Promise<void> {
    await this.mirrorFramesWithMoments(true);
    await this.refreshPhotoFrames();
  }

  async syncFramesFromMoments(): Promise<void> {
    const creds = this.momentsGalleryCreds();
    if (!creds || !window.pbApi?.gallerySyncFrames) {
      this.status.set('Set Gallery API base URL in Admin → Gallery first.');
      return;
    }
    this.busy.set(true);
    try {
      await this.mirrorFramesWithMoments(false);
      await this.refreshPhotoFrames();
    } finally {
      this.busy.set(false);
    }
  }

  async publishFrameToMoments(filename: string): Promise<void> {
    const creds = this.momentsGalleryCreds();
    if (!creds?.uploadToken || !window.pbApi?.galleryPublishFrame) {
      this.status.set('Set Gallery API URL + upload token in Admin → Gallery first.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.pbApi.galleryPublishFrame({
        apiBaseUrl: creds.apiBaseUrl,
        uploadToken: creds.uploadToken,
        filename,
      });
      this.status.set(r.ok ? `Published ${filename} to Moments.` : r.error ?? 'Publish failed.');
    } finally {
      this.busy.set(false);
    }
  }

  async deleteRemoteFrame(filename: string): Promise<void> {
    const creds = this.momentsGalleryCreds();
    if (!creds?.uploadToken || !window.pbApi?.galleryDeleteRemoteFrame) {
      this.status.set('Set Gallery API URL + upload token in Admin → Gallery first.');
      return;
    }
    if (!confirm(`Delete "${filename}" from Moments and this machine?`)) return;
    this.busy.set(true);
    try {
      const r = await window.pbApi.galleryDeleteRemoteFrame({
        apiBaseUrl: creds.apiBaseUrl,
        uploadToken: creds.uploadToken,
        filename,
      });
      if (r.ok && window.pbApi.adminDeletePhotoFrame) {
        await window.pbApi.adminDeletePhotoFrame(filename);
        this.draftGuestFrameFiles = this.draftGuestFrameFiles.filter((f) => f !== filename);
        if (this.draftDefaultFrameFile === filename) {
          this.draftDefaultFrameFile = null;
        }
        await this.refreshPhotoFrames();
      }
      this.status.set(r.ok ? `Deleted ${filename} on Moments and locally.` : r.error ?? 'Remote delete failed.');
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

  async saveDebug(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const ok = await this.booth.save({
        debug: { ...this.draftDebug },
      });
      if (ok) {
        this.syncFromService();
        this.status.set(
          this.draftDebug.enabled
            ? 'Debug logging enabled — live panel is on.'
            : 'Debug logging disabled.',
        );
        if (this.draftDebug.enabled) {
          await this.refreshDebugPanel();
          await this.boothLog.info('admin', 'debug panel enabled');
        }
      } else {
        this.status.set('Save failed (run in Electron).');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async refreshDebugPanel(): Promise<void> {
    const p = await this.boothLog.refreshLogPath();
    this.logFilePath.set(p);
    await this.boothLog.loadTailFromDisk(300);
  }

  clearDebugPanel(): void {
    this.boothLog.clear();
    this.status.set('Cleared on-screen log buffer (file on disk kept).');
  }

  async pingDebugLog(): Promise<void> {
    await this.boothLog.info('admin', 'debug ping', {
      at: new Date().toISOString(),
      galleryEnabled: this.draftGallery.enabled,
    });
    this.status.set('Wrote a test log line.');
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
