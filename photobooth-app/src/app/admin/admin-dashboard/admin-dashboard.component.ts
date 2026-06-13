import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  PhotoboothBranding,
  PhotoboothCopy,
  PhotoboothKiaApiConfig,
  PhotoboothScannerConfig,
} from '../../models/photobooth-config.model';
import {
  PHOTOBOOTH_DEFAULT_BRANDING,
  PHOTOBOOTH_DEFAULT_COPY,
  PHOTOBOOTH_DEFAULT_KIA_API,
  PHOTOBOOTH_DEFAULT_KIA_API_PATHS,
  PHOTOBOOTH_DEFAULT_SCANNER,
} from '../../models/photobooth-config.model';
import { KiaApiService } from '../../services/kia-api.service';
import type { PbScannerPortInfo } from '../../../types/pb-api';
import { BoothConfigService } from '../../services/booth-config.service';
import { BrandingLogoService } from '../../services/branding-logo.service';
import { setAdminSession } from '../admin.guard';
import { enterAdminRoute, leaveAdminRoute } from '../admin-route-body';

@Component({
  selector: 'pb-admin-dashboard',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  tab: 'copy' | 'branding' | 'scanner' = 'copy';
  draft: PhotoboothCopy = structuredClone(PHOTOBOOTH_DEFAULT_COPY);
  draftBranding: PhotoboothBranding = structuredClone(PHOTOBOOTH_DEFAULT_BRANDING);
  draftScanner: PhotoboothScannerConfig = structuredClone(PHOTOBOOTH_DEFAULT_SCANNER);
  draftKiaApi: PhotoboothKiaApiConfig = structuredClone(PHOTOBOOTH_DEFAULT_KIA_API);
  bearerTokenDraft = '';
  readonly uploadQueuePending = signal(0);
  readonly bearerConfigured = signal(false);
  serialPorts = signal<PbScannerPortInfo[]>([]);
  scannerPortsMessage = signal<string | null>(null);
  scannerStatus = signal('disconnected');
  lastScan = signal<string | null>(null);
  status = signal<string | null>(null);
  busy = signal(false);

  constructor(
    readonly booth: BoothConfigService,
    readonly branding: BrandingLogoService,
    private readonly router: Router,
    private readonly kiaApi: KiaApiService,
  ) {}

  ngOnInit(): void {
    enterAdminRoute();
    this.syncFromService();
    void this.branding.refresh();
  }

  ngOnDestroy(): void {
    leaveAdminRoute();
  }

  private syncFromService(): void {
    this.draft = structuredClone(this.booth.copy());
    this.draftBranding = structuredClone(this.booth.branding());
    const cfg = this.booth.config();
    this.draftScanner = structuredClone(cfg?.scanner ?? PHOTOBOOTH_DEFAULT_SCANNER);
    this.draftKiaApi = structuredClone(cfg?.kiaApi ?? PHOTOBOOTH_DEFAULT_KIA_API);
    this.draftKiaApi.paths = {
      ...PHOTOBOOTH_DEFAULT_KIA_API_PATHS,
      ...this.draftKiaApi.paths,
    };
    this.bearerConfigured.set(cfg?.bearerConfigured ?? false);
    this.bearerTokenDraft = '';
    void this.refreshUploadQueue();
  }

  setTab(t: 'copy' | 'branding' | 'scanner'): void {
    this.tab = t;
    if (t === 'scanner') {
      void this.refreshScannerAdmin();
      void this.refreshUploadQueue();
    }
    if (t === 'branding') {
      void this.branding.refresh();
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
        uploadImageFormat: kiaApi.uploadImageFormat,
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

  async reloadConfig(): Promise<void> {
    await this.booth.load();
    this.syncFromService();
    await this.branding.refresh();
    this.status.set('Reloaded from disk.');
  }

  async pickLogo(): Promise<void> {
    if (!window.pbApi?.adminPickLogoImage || !window.pbApi?.adminInstallLogo) {
      this.status.set('Logo upload requires the Electron app.');
      return;
    }
    this.busy.set(true);
    this.status.set(null);
    try {
      const pick = await window.pbApi.adminPickLogoImage();
      if (!pick.ok || pick.canceled || !pick.path) {
        this.status.set(pick.canceled ? null : pick.ok ? null : 'Could not open file picker.');
        return;
      }
      const install = await window.pbApi.adminInstallLogo(pick.path);
      if (!install.ok) {
        this.status.set(install.error || 'Logo install failed.');
        return;
      }
      await this.booth.load();
      this.syncFromService();
      await this.branding.refresh();
      this.status.set('Logo updated.');
    } finally {
      this.busy.set(false);
    }
  }

  async clearLogo(): Promise<void> {
    if (!window.pbApi?.adminClearLogo) {
      this.status.set('Logo reset requires the Electron app.');
      return;
    }
    this.busy.set(true);
    this.status.set(null);
    try {
      const r = await window.pbApi.adminClearLogo();
      if (!r.ok) {
        this.status.set(r.error || 'Could not reset logo.');
        return;
      }
      await this.booth.load();
      this.syncFromService();
      await this.branding.refresh();
      this.status.set('Logo reset to default KIA mark.');
    } finally {
      this.busy.set(false);
    }
  }

  async saveBranding(): Promise<void> {
    this.status.set(null);
    this.busy.set(true);
    try {
      const logoScalePercent = Math.min(
        200,
        Math.max(50, Math.round(this.draftBranding.logoScalePercent || 100)),
      );
      this.draftBranding.logoScalePercent = logoScalePercent;
      const ok = await this.booth.save({ branding: { logoScalePercent } });
      this.status.set(ok ? 'Logo size saved.' : 'Save failed (run in Electron).');
      if (ok) this.syncFromService();
    } finally {
      this.busy.set(false);
    }
  }

  logout(): void {
    setAdminSession(false);
    void this.router.navigate(['/admin/login']);
  }
}
