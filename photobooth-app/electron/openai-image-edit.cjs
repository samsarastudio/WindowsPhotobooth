'use strict';
const https = require('node:https');
const GPT_IMAGE_EDIT_MODELS = ['gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5'];
function gptImageEditQuality(model, preferMax = false) {
  if (String(model || '').includes('2.5')) return preferMax ? 'max' : 'xhigh';
  return 'high';
}

function buildGptImageEditForm(
  FormData,
  sceneBuf,
  fullPrompt,
  extraImages = [],
  model = 'gpt-image-2.5-sunburst',
  size = '1536x1024',
  maskBuf = null,
  quality = null,
) {
  const form = new FormData();
  form.append('model', model);
  form.append('image[]', sceneBuf, { filename: 'scene.png', contentType: 'image/png' });
  const extras = Array.isArray(extraImages) ? extraImages : extraImages ? [extraImages] : [];
  for (const extra of extras) {
    if (!extra?.buf) continue;
    form.append('image[]', extra.buf, {
      filename: extra.filename || 'ref.png',
      contentType: extra.contentType || 'image/png',
    });
  }
  if (maskBuf) {
    form.append('mask', maskBuf, { filename: 'mask.png', contentType: 'image/png' });
  }
  form.append('prompt', fullPrompt);
  form.append('n', '1');
  form.append('size', size);
  form.append('quality', quality || gptImageEditQuality(model));
  // input_fidelity is for gpt-image-1 / 1.5 only — omit on gpt-image-2+.
  if (!String(model || '').startsWith('gpt-image-2')) {
    form.append('input_fidelity', 'high');
  }
  return form;
}

async function callOpenAiImageEdit(
  apiKey,
  pngBuf,
  fullPrompt,
  httpsPostMultipart,
  FormData,
  extraImages = [],
  size = '1536x1024',
  maskBuf = null,
  options = {},
) {
  const preferMax = !!options.preferMax;
  const allowDalle2Fallback = options.allowDalle2Fallback !== false;
  const parseJsonSafe = (text) => {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  };
  const makeErr = (statusCode, json, text) =>
    json?.error?.message || json?.message || text.slice(0, 400) || `HTTP ${statusCode}`;

  const auth = { Authorization: `Bearer ${apiKey.trim()}` };
  const gptModels = GPT_IMAGE_EDIT_MODELS;
  let json = null;
  let modelUsed = gptModels[0];
  let lastErr = 'GPT image edit failed.';
  const extras = Array.isArray(extraImages)
    ? extraImages
    : extraImages
      ? [{ buf: extraImages, filename: 'brand-logo-ref.png' }]
      : [];

  for (const model of gptModels) {
    const form = buildGptImageEditForm(
      FormData,
      pngBuf,
      fullPrompt,
      extras,
      model,
      size,
      maskBuf,
      gptImageEditQuality(model, preferMax),
    );
    const gptRes = await httpsPostMultipart('https://api.openai.com/v1/images/edits', form, auth);
    const gptJson = parseJsonSafe(gptRes.body);
    if (gptRes.statusCode >= 200 && gptRes.statusCode < 300 && gptJson) {
      json = gptJson;
      modelUsed = model;
      break;
    }
    lastErr = makeErr(gptRes.statusCode, gptJson, gptRes.body);
  }

  if (!json) {
    if (!allowDalle2Fallback) {
      return { ok: false, error: lastErr };
    }
    // DALL·E 2 edits: single image only (no reference-image array). Avoid for head-swap portraits.
    const dallePrompt = fullPrompt.length > 1000 ? fullPrompt.slice(0, 1000) : fullPrompt;
    const form = new FormData();
    form.append('image', pngBuf, { filename: 'photo.png', contentType: 'image/png' });
    if (maskBuf) {
      form.append('mask', maskBuf, { filename: 'mask.png', contentType: 'image/png' });
    }
    form.append('prompt', dallePrompt);
    form.append('model', 'dall-e-2');
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('response_format', 'b64_json');
    const d2Res = await httpsPostMultipart('https://api.openai.com/v1/images/edits', form, auth);
    const d2Json = parseJsonSafe(d2Res.body);
    const d2Ok = d2Res.statusCode >= 200 && d2Res.statusCode < 300 && !!d2Json;
    if (!d2Ok) {
      const fallbackErr = makeErr(d2Res.statusCode, d2Json, d2Res.body);
      return {
        ok: false,
        error: `${lastErr} (GPT image edits failed; fallback dall-e-2 also failed: ${fallbackErr})`,
      };
    }
    json = d2Json;
    modelUsed = 'dall-e-2';
  }

  const entry = json.data && json.data[0];
  const b64 = entry && entry.b64_json;
  const imageUrl = entry && entry.url;
  let outBuf;
  if (b64) {
    outBuf = Buffer.from(b64, 'base64');
  } else if (imageUrl) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return { ok: false, error: 'Could not download generated image.' };
    }
    const ab = await imgRes.arrayBuffer();
    outBuf = Buffer.from(ab);
  } else {
    return { ok: false, error: 'No image data in API response.' };
  }
  return { ok: true, outBuf, model: modelUsed };
}

function httpsPostMultipart(urlString, form, authHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          ...authHeaders,
          ...form.getHeaders(),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    form.pipe(req);
  });
}
module.exports = { callOpenAiImageEdit, httpsPostMultipart };
