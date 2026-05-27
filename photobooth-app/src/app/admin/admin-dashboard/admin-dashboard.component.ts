import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { PhotoboothAiMode, PhotoboothCopy } from '../../models/photobooth-config.model';
import {
  NEWSPAPER_AI_PROMPT,
  PHOTOBOOTH_DEFAULT_AI_MODES,
  PHOTOBOOTH_DEFAULT_COPY,
} from '../../models/photobooth-config.model';
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
  tab: 'copy' | 'themes' | 'branding' | 'ai' = 'copy';
  draft: PhotoboothCopy = structuredClone(PHOTOBOOTH_DEFAULT_COPY);
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
    this.openAiKeyDraft = '';
  }

  setTab(t: 'copy' | 'themes' | 'branding' | 'ai'): void {
    this.tab = t;
    if (t === 'themes') {
      void this.refreshThemes();
    }
    if (t === 'branding') {
      void this.branding.refresh();
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
