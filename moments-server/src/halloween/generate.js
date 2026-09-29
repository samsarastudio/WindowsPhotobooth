import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import {
  callOpenAiImageEdit,
  buildEditPrompt,
  HEAD_SWAP_INPAINT,
  HALLOWEEN_SCENE_INPAINT,
} from './openai-edit.js';
import {
  buildHeadEraseScene,
  buildHeadEditMaskPng,
  buildInpaintComposite,
  buildScenePreserveMask,
  exportFinal,
  loadFaceJson,
  prepareGuestHeadPng,
} from './pipelines.js';
import {
  halloweenGalleryDir,
  halloweenSamplesDir,
  pumpkinPatchPath,
  sampleOriginalPath,
  SAMPLE_DEFS,
  vampireCompositionPath,
  vampireFacePath,
} from './paths.js';
import {
  getHalloweenApiKey,
  consumeGenerationSlot,
  remainingGenerations,
  getHalloweenSettings,
} from './store.js';
import { applyHalloweenFrame } from './frame.js';

async function runPipeline(guestPath, pipeline) {
  let pngBuf = null;
  let maskBuf = null;
  const extraImages = [];
  let gptSize = '1536x1024';
  let effectivePrompt = '';

  if (pipeline === 'head-swap') {
    const plate = vampireCompositionPath();
    if (!fs.existsSync(plate)) {
      return { ok: false, error: 'Vampire composition plate missing.' };
    }
    const face = loadFaceJson(vampireFacePath());
    const erased = await buildHeadEraseScene(plate, face);
    pngBuf = erased?.buf || null;
    const faceRef = await prepareGuestHeadPng(guestPath, 1024, 1024);
    extraImages.push({ buf: faceRef, filename: 'guest-face.png' });
    effectivePrompt = HEAD_SWAP_INPAINT;
    gptSize = '1024x1536';
    if (pngBuf) {
      const pngMeta = await sharp(pngBuf).metadata();
      maskBuf = await buildHeadEditMaskPng(
        pngMeta.width || 1024,
        pngMeta.height || 1536,
        erased.face || face,
      );
    }
  } else {
    const bg = pumpkinPatchPath();
    if (!fs.existsSync(bg)) {
      return { ok: false, error: 'Pumpkin patch background missing.' };
    }
    pngBuf = await buildInpaintComposite(bg, guestPath);
    effectivePrompt = HALLOWEEN_SCENE_INPAINT;
    gptSize = '1536x1024';
    if (pngBuf) {
      const pngMeta = await sharp(pngBuf).metadata();
      maskBuf = await buildScenePreserveMask(pngMeta.width || 1536, pngMeta.height || 1024);
    }
  }

  if (!pngBuf) {
    return { ok: false, error: 'Prepared PNG exceeded size limit.' };
  }

  const apiKey = getHalloweenApiKey();
  const fullPrompt = buildEditPrompt(effectivePrompt, pipeline);
  const editRes = await callOpenAiImageEdit(
    apiKey,
    pngBuf,
    fullPrompt,
    extraImages,
    gptSize,
    maskBuf,
    { preferMax: true },
  );

  if (!editRes.ok) {
    return { ok: false, error: editRes.error || 'Image edit failed' };
  }

  const outBuf = await applyHalloweenFrame(await exportFinal(editRes.outBuf, pipeline), pipeline);
  return { ok: true, outBuf, model: editRes.model, pipeline };
}

function checkQuotaAndKey() {
  const apiKey = getHalloweenApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: 'OpenAI API key not configured. Set it in Moments Admin → Settings → Halloween demo.',
    };
  }
  const quota = getHalloweenSettings();
  if (quota.generationRemaining <= 0) {
    return {
      ok: false,
      error: `Demo generation limit reached (${quota.generationUsed}/${quota.generationLimit}). Reset the counter in Admin.`,
      remaining: 0,
      used: quota.generationUsed,
      limit: quota.generationLimit,
    };
  }
  return { ok: true };
}

function saveGalleryResult(outBuf, sampleId, pipeline, model, { updateShowcase = false } = {}) {
  const id = nanoid(12);
  const filename = `${Date.now()}-${sampleId}-${id}.png`;
  const outPath = path.join(halloweenGalleryDir(), filename);
  fs.writeFileSync(outPath, outBuf);

  if (updateShowcase) {
    const def = SAMPLE_DEFS.find((s) => s.id === sampleId);
    if (def?.aiFile) {
      try {
        fs.writeFileSync(path.join(halloweenSamplesDir, def.aiFile), outBuf);
      } catch {
        /* showcase update best-effort */
      }
    }
  }

  const slot = consumeGenerationSlot();
  return {
    ok: true,
    model,
    sampleId,
    pipeline,
    filename,
    url: `/media/halloween/gallery/${encodeURIComponent(filename)}`,
    remaining: remainingGenerations(),
    used: slot.used + 1,
    limit: slot.limit,
  };
}

/**
 * Run HauntBooth-equivalent pipeline on a demo sample photo.
 * @param {'portrait'|'scene'} sampleId
 */
export async function generateFromSample(sampleId) {
  const def = SAMPLE_DEFS.find((s) => s.id === sampleId);
  if (!def) {
    return { ok: false, error: 'Unknown sample' };
  }

  const gate = checkQuotaAndKey();
  if (!gate.ok) return gate;

  const guestPath = sampleOriginalPath(sampleId);
  if (!guestPath || !fs.existsSync(guestPath)) {
    return { ok: false, error: 'Sample original photo missing on server.' };
  }

  try {
    const result = await runPipeline(guestPath, def.pipeline);
    if (!result.ok) {
      return { ...result, remaining: remainingGenerations() };
    }
    return saveGalleryResult(result.outBuf, sampleId, result.pipeline, result.model, {
      updateShowcase: true,
    });
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      remaining: remainingGenerations(),
    };
  }
}

/**
 * Run pipeline on a custom guest upload (camera / gallery).
 * @param {'portrait'|'scene'} mode
 * @param {Buffer} imageBuf
 */
export async function generateFromUpload(mode, imageBuf) {
  const def = SAMPLE_DEFS.find((s) => s.id === mode);
  if (!def) {
    return { ok: false, error: 'mode must be portrait or scene' };
  }

  const gate = checkQuotaAndKey();
  if (!gate.ok) return gate;

  const uploadsDir = path.join(halloweenGalleryDir(), '_uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const uploadName = `${Date.now()}-upload-${nanoid(8)}.png`;
  const guestPath = path.join(uploadsDir, uploadName);

  try {
    const prepared = await sharp(imageBuf)
      .rotate()
      .resize(mode === 'portrait' ? 1200 : 1800, mode === 'portrait' ? 1800 : 1200, {
        fit: 'cover',
        position: 'centre',
      })
      .png()
      .toBuffer();
    fs.writeFileSync(guestPath, prepared);

    const result = await runPipeline(guestPath, def.pipeline);
    if (!result.ok) {
      return { ...result, remaining: remainingGenerations() };
    }
    return saveGalleryResult(result.outBuf, mode, result.pipeline, result.model);
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      remaining: remainingGenerations(),
    };
  }
}
