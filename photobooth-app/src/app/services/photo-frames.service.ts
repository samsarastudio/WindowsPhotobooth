import { Injectable, computed, inject, signal } from '@angular/core';

import type { PbPhotoBoothFrame } from '../../types/pb-api';

import { KiaApiService } from './kia-api.service';
import { ApiDebugLogService } from './api-debug-log.service';

/** Default booth profile icon (kiaexperience.info/images/kiaprofile.svg). */
export const BOOTH_PROFILE_ICON = 'kia/kiaprofile.svg';

export interface BoothFrameSlot {
  id: number;
  label: string;
  icon: string;
  /** file:// or data: for picker thumb */
  iconPath: string;
  frameImage: string;
  /** file:// ref for upload composite — not a data URL */
  frameImagePath: string;
}

export interface BoothEffectSlot {
  key: string;
  label: string;
  icon: string;
  frameId: number;
  frameImage: string;
  frameImagePath: string;
}

function frameLabel(frame: PbPhotoBoothFrame, index: number): string {
  return (
    (typeof frame.name === 'string' && frame.name) ||
    (typeof frame.label === 'string' && frame.label) ||
    `Frame ${index + 1}`
  );
}

function isFileRef(url: string): boolean {
  return url.startsWith('file://');
}

function isUnlocked(frame: PbPhotoBoothFrame): boolean {
  const raw = frame.is_unlocked;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  return frame.is_premium !== true && frame.is_premium !== 1;
}

function shouldShowFrame(frame: PbPhotoBoothFrame): boolean {
  const id = typeof frame.id === 'number' ? frame.id : Number(frame.id);
  if (!Number.isFinite(id)) return false;
  if (frame.is_active === 0 || frame.is_active === false) return false;
  return isUnlocked(frame);
}

async function resolveDisplayImage(url: string): Promise<string> {
  if (!url) return '';
  if (url.startsWith('data:')) return url;

  const read = window.pbApi?.readFileBase64;
  if (url.startsWith('file://') && read) {
    try {
      return await read(url);
    } catch {
      return '';
    }
  }

  if (!/^https?:\/\//i.test(url)) {
    if (read) {
      try {
        return await read(url);
      } catch {
        return '';
      }
    }
    return url;
  }

  const fetch = window.pbApi?.fetchImageDataUrl;
  if (!fetch) return '';
  try {
    const res = await fetch(url);
    if (res.ok && res.dataUrl) return res.dataUrl;
  } catch {
    /* letter badge fallback in template */
  }
  return '';
}

@Injectable({ providedIn: 'root' })
export class PhotoFramesService {
  private readonly kiaApi = inject(KiaApiService);
  private readonly debugLog = inject(ApiDebugLogService);

  private readonly _frames = signal<BoothFrameSlot[]>([]);
  private readonly _loaded = signal(false);
  private readonly _offline = signal(false);
  private readonly _frameListSource = signal<string | null>(null);
  private readonly _debugInfo = signal<string | null>(null);

  readonly frames = this._frames.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly offline = this._offline.asReadonly();
  readonly frameListSource = this._frameListSource.asReadonly();
  readonly debugInfo = this._debugInfo.asReadonly();

  readonly effectSlots = computed((): BoothEffectSlot[] =>
    this._frames().map((f) => ({
      key: `frame-${f.id}`,
      label: f.label,
      icon: f.icon,
      frameId: f.id,
      frameImage: f.frameImage,
      frameImagePath: f.frameImagePath,
    })),
  );

  async loadFrames(): Promise<void> {
    const res = await this.kiaApi.fetchFrames();
    const dbg = res.debug;
    const source = res.frameListSource || dbg?.source || 'unknown';

    this._offline.set(Boolean(res.offline));
    this._frameListSource.set(source);
    this._debugInfo.set(
      dbg?.message ||
        (dbg
          ? `frames: ${dbg.count ?? 0} (${source}${dbg.unlocked != null ? `, ${dbg.unlocked} unlocked` : ''})`
          : res.error ?? null),
    );

    this.debugLog.log({
      kind: 'frame-asset',
      method: 'FETCH',
      ok: res.ok !== false,
      url: '/frames',
      response: {
        frameListSource: source,
        count: dbg?.count,
        offline: res.offline,
        fromCache: res.fromCache,
        cachedAt: res.framesCachedAt || dbg?.cachedAt,
        message: dbg?.message,
      },
      error: res.error,
    });

    const apiFrames = (res.frames || []).filter((f) => shouldShowFrame(f));
    const sorted = [...apiFrames].sort((a, b) => {
      const ao = typeof a.sort_order === 'number' ? a.sort_order : Number(a.id);
      const bo = typeof b.sort_order === 'number' ? b.sort_order : Number(b.id);
      return ao - bo;
    });

    const parsed: BoothFrameSlot[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const id = typeof f.id === 'number' ? f.id : Number(f.id);
      if (!Number.isFinite(id)) continue;

      const thumbRef = f.thumbnail || '';
      const frameRef =
        f.frame_image || f.frameImage || f.image_url || f.imageUrl || f.file_path || '';

      let frameImagePath = isFileRef(frameRef) ? frameRef : '';
      if (!frameImagePath && window.pbApi?.kiaBundledFrameAsset) {
        const bundled = await window.pbApi.kiaBundledFrameAsset(id, 'frame_image');
        if (bundled.ok && bundled.path) frameImagePath = bundled.path;
      }

      let iconPath = isFileRef(thumbRef) ? thumbRef : '';
      if (!iconPath && frameImagePath) {
        iconPath = frameImagePath;
      }

      const icon = (await resolveDisplayImage(iconPath || thumbRef)) || BOOTH_PROFILE_ICON;
      const frameImage = frameImagePath
        ? await resolveDisplayImage(frameImagePath)
        : (await resolveDisplayImage(frameRef)) || '';

      parsed.push({
        id,
        label: frameLabel(f, i),
        icon,
        iconPath,
        frameImage,
        frameImagePath,
      });

      this.debugLog.log({
        kind: 'frame-asset',
        method: 'SLOT',
        ok: Boolean(frameImagePath || frameImage),
        url: `frame-${id}`,
        response: {
          label: frameLabel(f, i),
          frameListSource: source,
          frameImagePath: frameImagePath || null,
          iconPath: iconPath || null,
          iconBytes: icon.length,
          frameImageBytes: frameImage.length,
        },
      });
    }

    this._frames.set(parsed);
    this._loaded.set(true);
  }

  frameIdForKey(key: string): number | null {
    const slot = this.effectSlots().find((s) => s.key === key);
    return slot?.frameId ?? null;
  }

  slotForKey(key: string): BoothEffectSlot | undefined {
    return this.effectSlots().find((s) => s.key === key);
  }
}
