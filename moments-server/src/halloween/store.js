import fs from 'node:fs';
import path from 'node:path';
import { loadSettings, saveSettings } from '../db.js';
import { halloweenGalleryDir, halloweenSamplesDir, SAMPLE_DEFS } from './paths.js';

const DEFAULT_LIMIT = 5;

export function getHalloweenSettings() {
  const s = loadSettings();
  const limit =
    typeof s.halloweenGenerationLimit === 'number' && s.halloweenGenerationLimit > 0
      ? Math.floor(s.halloweenGenerationLimit)
      : DEFAULT_LIMIT;
  const used =
    typeof s.halloweenGenerationCount === 'number' && s.halloweenGenerationCount >= 0
      ? Math.floor(s.halloweenGenerationCount)
      : 0;
  const apiKey =
    typeof s.halloweenOpenAiApiKey === 'string' ? s.halloweenOpenAiApiKey.trim() : '';
  return {
    apiKeyConfigured: !!apiKey,
    /** Never expose full key to public endpoints */
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}` : '',
    generationLimit: limit,
    generationUsed: used,
    generationRemaining: Math.max(0, limit - used),
  };
}

export function getHalloweenApiKey() {
  const s = loadSettings();
  const fromSettings =
    typeof s.halloweenOpenAiApiKey === 'string' ? s.halloweenOpenAiApiKey.trim() : '';
  if (fromSettings) return fromSettings;
  const fromEnv = String(process.env.OPENAI_API_KEY || '').trim();
  return fromEnv || '';
}

export function remainingGenerations() {
  return getHalloweenSettings().generationRemaining;
}

/** Atomically consume one generation slot. Returns { ok, used, limit }. */
export function consumeGenerationSlot() {
  const cur = loadSettings();
  const limit =
    typeof cur.halloweenGenerationLimit === 'number' && cur.halloweenGenerationLimit > 0
      ? Math.floor(cur.halloweenGenerationLimit)
      : DEFAULT_LIMIT;
  const used =
    typeof cur.halloweenGenerationCount === 'number' && cur.halloweenGenerationCount >= 0
      ? Math.floor(cur.halloweenGenerationCount)
      : 0;
  if (used >= limit) {
    return { ok: false, used, limit };
  }
  saveSettings({ halloweenGenerationCount: used + 1 });
  return { ok: true, used, limit };
}

export function listGalleryItems() {
  const dir = halloweenGalleryDir();
  const files = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      const sampleId = name.includes('-scene-')
        ? 'scene'
        : name.includes('-portrait-')
          ? 'portrait'
          : 'unknown';
      files.push({
        id: name,
        filename: name,
        sampleId,
        createdAt: st.mtime.toISOString(),
        bytes: st.size,
        url: `/media/halloween/gallery/${encodeURIComponent(name)}`,
      });
    }
  } catch {
    /* empty */
  }
  files.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return files;
}

export function publicHalloweenMeta() {
  const settings = getHalloweenSettings();
  let assetVersion = Date.now();
  try {
    const times = SAMPLE_DEFS.flatMap((s) =>
      [s.originalFile, s.aiFile].map((f) => {
        try {
          return fs.statSync(path.join(halloweenSamplesDir, f)).mtimeMs;
        } catch {
          return 0;
        }
      }),
    );
    assetVersion = Math.floor(Math.max(0, ...times)) || assetVersion;
  } catch {
    /* keep now */
  }
  return {
    ok: true,
    brand: 'HauntBooth',
    assetVersion,
    samples: SAMPLE_DEFS.map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      pipeline: s.pipeline,
      originalUrl: `/media/halloween/samples/${encodeURIComponent(s.originalFile)}?v=${assetVersion}`,
      aiUrl: `/media/halloween/samples/${encodeURIComponent(s.aiFile)}?v=${assetVersion}`,
    })),
    gallery: listGalleryItems(),
    apiKeyConfigured: settings.apiKeyConfigured,
    generationLimit: settings.generationLimit,
    generationUsed: settings.generationUsed,
    generationRemaining: settings.generationRemaining,
  };
}

/** Admin-only payload (includes masked key + editable fields). */
export function adminHalloweenPayload() {
  const settings = getHalloweenSettings();
  return {
    ...settings,
    openAiApiKey: settings.apiKeyMasked,
  };
}
