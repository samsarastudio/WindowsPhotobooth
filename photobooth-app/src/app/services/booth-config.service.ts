import { Injectable, computed, signal } from '@angular/core';
import type { PhotoboothConfig, PhotoboothBranding, PhotoboothCopy } from '../models/photobooth-config.model';
import { PHOTOBOOTH_DEFAULT_BRANDING, PHOTOBOOTH_DEFAULT_COPY } from '../models/photobooth-config.model';

function mergeCopy(base: PhotoboothCopy, patch?: Partial<PhotoboothCopy>): PhotoboothCopy {
  if (!patch) return base;
  return {
    attract: { ...base.attract, ...patch.attract },
    qr: { ...base.qr, ...patch.qr },
    capture: { ...base.capture, ...patch.capture },
    result: { ...base.result, ...patch.result },
  };
}

function mergeBranding(patch?: Partial<PhotoboothBranding> | null): PhotoboothBranding {
  const base = PHOTOBOOTH_DEFAULT_BRANDING;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    logoFile: patch.logoFile === undefined ? base.logoFile : patch.logoFile,
  };
}

function normalizeConfigPayload(raw: unknown): PhotoboothConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const { adminPin: _a, ...rest } = o;
  const copy = mergeCopy(
    PHOTOBOOTH_DEFAULT_COPY,
    (rest['copy'] as Partial<PhotoboothCopy> | undefined) ?? undefined,
  );
  let activeRaw = rest['activeThemeId'];
  if (typeof activeRaw === 'string' && activeRaw === 'kia') {
    activeRaw = 'circuit';
  }
  const branding = mergeBranding(
    (rest['branding'] as Partial<PhotoboothBranding> | undefined) ?? undefined,
  );
  return {
    activeThemeId: typeof activeRaw === 'string' ? activeRaw : 'default',
    branding,
    copy,
  };
}

@Injectable({ providedIn: 'root' })
export class BoothConfigService {
  private readonly state = signal<PhotoboothConfig | null>(null);

  readonly config = computed(() => this.state());
  readonly copy = computed(() => this.state()?.copy ?? PHOTOBOOTH_DEFAULT_COPY);
  readonly branding = computed(() => this.state()?.branding ?? PHOTOBOOTH_DEFAULT_BRANDING);
  readonly activeThemeId = computed(() => this.state()?.activeThemeId ?? 'default');

  async load(): Promise<void> {
    if (typeof window !== 'undefined' && window.pbApi?.adminGetConfig) {
      const r = await window.pbApi.adminGetConfig();
      if (r.ok && r.config) {
        this.state.set(normalizeConfigPayload(r.config));
        return;
      }
    }
    const res = await fetch('/config/photobooth-config.default.json');
    if (!res.ok) {
      this.state.set({
        activeThemeId: 'default',
        branding: PHOTOBOOTH_DEFAULT_BRANDING,
        copy: PHOTOBOOTH_DEFAULT_COPY,
      });
      return;
    }
    const raw = await res.json();
    this.state.set(normalizeConfigPayload(raw));
  }

  async save(partial: Partial<PhotoboothConfig>): Promise<boolean> {
    if (!window.pbApi?.adminSaveConfig) return false;
    const r = await window.pbApi.adminSaveConfig(partial);
    if (r.ok && r.config) {
      this.state.set(normalizeConfigPayload(r.config));
      return true;
    }
    return false;
  }
}
