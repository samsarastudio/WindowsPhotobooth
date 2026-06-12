import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  PhotoboothAiMode,
  PhotoboothCopy,
  PhotoboothKiaApiConfig,
  PhotoboothScannerConfig,
} from '../../models/photobooth-config.model';
import {
  NEWSPAPER_AI_PROMPT,
  PHOTOBOOTH_DEFAULT_AI_MODES,
  PHOTOBOOTH_DEFAULT_COPY,
  PHOTOBOOTH_DEFAULT_KIA_API,
  PHOTOBOOTH_DEFAULT_KIA_API_PATHS,
  PHOTOBOOTH_DEFAULT_SCANNER,
} from '../../models/photobooth-config.model';
import { KiaApiService } from '../../services/kia-api.service';
import type { PbScannerPortInfo } from '../../../types/pb-api';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { BoothConfigService } from '../../services/booth-config.service';
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

@Component({
  selector: 'pb-admin-dashboard',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  tab: 'copy' | 'themes' | 'branding' | 'ai' | 'scanner' = 'copy';
  draft: PhotoboothCopy = structuredClone(PHOTOBOOTH_DEFAULT_COPY);
  draftScanner: PhotoboothScannerConfig = structuredClone(PHOTOBOOTH_DEFAULT_SCANNER);
  draftKiaApi: PhotoboothKiaApiConfig = structuredClone(PHOTOBOOTH_DEFAULT_KIA_API);
  bearerTokenDraft = '';
  readonly uploadQueuePending = signal(0);
  readonly bearerConfigured = signal(false);
  serialPorts = signal<PbScannerPortInfo[]>([]);
  scannerPortsMessage = signal<string | null>(null);
  scannerStatus = signal('disconnected');
  lastScan = signal<string | null>(null);
  activeThemeId = 'default';
  draftAiEnabled = false;
  draftAiModes: PhotoboothAiMode[] = structuredClone(PHOTOBOOTH_DEFAULT_AI_MODES);
  /** Only sent on save when non-empty; replaces stored key. */
  openAiKeyDraft = '';
  themes = signal<ThemeListItem[]>([]);
  status = signal<string | null>(null);
  busy = signal(false);

  constructor(
    readonly booth: BoothConfigService,
    readonly branding: BrandingLogoService,
    private readonly theme: ThemeService,
    private readonly router: Router,
    private readonly kiaApi: KiaApiService,
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
    this.draftAiModes = structuredClone(cfg?.aiModes ?? PHOTOBOOTH_DEFAULT_AI_MODES);
    this.draftScanner = structuredClone(cfg?.scanner ?? PHOTOBOOTH_DEFAULT_SCANNER);
    this.draftKiaApi = structuredClone(cfg?.kiaApi ?? PHOTOBOOTH_DEFAULT_KIA_API);
    this.draftKiaApi.paths = {
      ...PHOTOBOOTH_DEFAULT_KIA_API_PATHS,
      ...this.draftKiaApi.paths,
    };
    this.bearerConfigured.set(cfg?.bearerConfigured ?? false);
    this.bearerTokenDraft = '';
    this.openAiKeyDraft = '';
    void this.refreshUploadQueue();
  }

  setTab(t: 'copy' | 'themes' | 'branding' | 'ai' | 'scanner'): void {
    this.tab = t;
    if (t === 'themes') {
      void this.refreshThemes();
    }
    if (t === 'branding') {
      void this.branding.refresh();
    }
    if (t === 'scanner') {
      void this.refreshScannerAdmin();
      void this.refreshUploadQueue();
    }
  }

  async refreshScannerAdmin(): Promise<void> {
    if (!window.pbApi?.scannerListPorts) {
      this.scannerPortsMessage.set(
        'Port list requires the Electron app (not browser-only dev server). You can type COM3 manually below.',
      );
      return;
    }
    this.scannerPortsMessage.set(null);
    const r = await window.pbApi.scannerListPorts();
    if (r.ok && r.ports) {
      this.serialPorts.set(r.ports);
      if (r.ports.length === 0) {
        this.scannerPortsMessage.set(
          'No COM ports detected. Connect the scanner USB cable, install the Datalogic USB-COM driver, then refresh — or type the port (e.g. COM3) manually.',
        );
      } else {
        this.scannerPortsMessage.set(`Found ${r.ports.length} port(s).`);
      }
    } else {
      this.serialPorts.set([]);
      this.scannerPortsMessage.set(
        r.error || 'Could not list COM ports. Type the port manually (e.g. COM3).',
      );
    }
    if (window.pbApi?.scannerGetStatus) {
      const s = await window.pbApi.scannerGetStatus();
      this.scannerStatus.set(s.status ?? 'disconnected');
      if (s.lastCode) this.lastScan.set(s.lastCode);
    }
    if (window.pbApi?.onScannerCode) {
      window.pbApi.onScannerCode(({ code }) => this.lastScan.set(code));
    }
  }

  async saveScanner(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    const comPort = this.draftScanner.comPort.trim().toUpperCase();
    const ok = await this.booth.save({
      scanner: { ...this.draftScanner, comPort },
    });
    this.busy.set(false);
    this.status.set(ok ? 'Scanner settings saved.' : 'Save failed.');
    if (ok) void this.refreshScannerAdmin();
  }

  async saveKiaApi(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    const kiaApi: PhotoboothKiaApiConfig = {
      ...this.draftKiaApi,
      baseUrl: this.draftKiaApi.baseUrl.trim().replace(/\/$/, ''),
      paths: { ...PHOTOBOOTH_DEFAULT_KIA_API_PATHS, ...this.draftKiaApi.paths },
      bearerToken: this.bearerTokenDraft.trim() || this.draftKiaApi.bearerToken,
    };
    const partial: Record<string, unknown> = {
      kiaApi: {
        baseUrl: kiaApi.baseUrl,
        qrPrefix: kiaApi.qrPrefix,
        bypassCode: kiaApi.bypassCode,
        devBypassEmail: kiaApi.devBypassEmail.trim(),
        offlineAllowPrefix: kiaApi.offlineAllowPrefix,
        debugMode: kiaApi.debugMode === true,
        paths: kiaApi.paths,
      },
    };
    if (this.bearerTokenDraft.trim()) {
      (partial['kiaApi'] as PhotoboothKiaApiConfig).bearerToken = this.bearerTokenDraft.trim();
    }
    const ok = await this.booth.save(partial as import('../../services/booth-config.service').BoothAdminSavePartial);
    this.busy.set(false);
    if (ok) {
      this.bearerTokenDraft = '';
      this.syncFromService();
    }
    this.status.set(ok ? 'API settings saved.' : 'Save failed.');
  }

  async refreshUploadQueue(): Promise<void> {
    const r = await this.kiaApi.getUploadQueueStatus();
    if (r.ok) this.uploadQueuePending.set(r.pending);
  }

  async testKiaConnection(): Promise<void> {
    this.busy.set(true);
    const r = await this.kiaApi.testConnection();
    this.busy.set(false);
    if (r.ok) {
      this.status.set(r.message || `API reachable (${r.statusCode ?? 'OK'})`);
    } else {
      this.status.set(r.error || 'Connection test failed.');
    }
  }

  async testScannerPort(): Promise<void> {
    if (!window.pbApi?.scannerOpen || !this.draftScanner.comPort.trim()) {
      this.status.set('Select a COM port first.');
      return;
    }
    this.busy.set(true);
    try {
      const r = await window.pbApi.scannerOpen(
        this.draftScanner.comPort.trim(),
        this.draftScanner.baudRate,
      );
      this.scannerStatus.set(r.status ?? 'error');
      this.status.set(r.ok ? 'Port opened for test.' : `Open failed: ${r.error ?? 'unknown'}`);
    } finally {
      this.busy.set(false);
    }
  }

  addAiMode(): void {
    const id = `mode_${Date.now()}`;
    this.draftAiModes = [...this.draftAiModes, { id, label: 'New mode', prompt: '' }];
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

  async saveAi(): Promise<void> {
    this.status.set(null);
    const normalized = this.draftAiModes
      .map((m) => ({
        id: m.id.trim(),
        label: m.label.trim(),
        prompt: m.prompt.trim(),
      }))
      .filter((m) => m.id.length > 0 && m.label.length > 0 && m.prompt.length > 0);
    if (normalized.length === 0) {
      this.status.set('Add at least one mode with id, label, and prompt.');
      return;
    }
    this.busy.set(true);
    try {
      const payload: Record<string, unknown> = {
        aiGenerationEnabled: this.draftAiEnabled,
        aiModes: normalized,
      };
      if (this.openAiKeyDraft.trim()) {
        payload['openAiApiKey'] = this.openAiKeyDraft.trim();
      }
      const ok = await this.booth.save(payload);
      if (ok) {
        this.openAiKeyDraft = '';
        this.status.set('AI settings saved.');
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
        this.status.set(`Logo saved (${inst.logoFile}).`);
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
        this.status.set('Logo removed; emoji icons restored.');
      } else {
        this.status.set(r.error ?? 'Could not remove logo.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async reloadConfig(): Promise<void> {
    await this.booth.load();
    this.syncFromService();
    await this.theme.applyFromConfig();
    await this.branding.refresh();
    this.status.set('Reloaded from disk.');
  }

  logout(): void {
    setAdminSession(false);
    void this.router.navigate(['/admin/login']);
  }
}
