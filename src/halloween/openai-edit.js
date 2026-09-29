import https from 'node:https';
import FormData from 'form-data';

const GPT_IMAGE_EDIT_MODELS = [
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  'gpt-image-1.5',
];

function gptImageEditQuality(model, preferMax = false) {
  if (String(model || '').includes('2.5')) return preferMax ? 'max' : 'xhigh';
  return 'high';
}

function buildGptImageEditForm(
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
  for (const extra of extraImages) {
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
  if (!String(model || '').startsWith('gpt-image-2')) {
    form.append('input_fidelity', 'high');
  }
  return form;
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

function decodeImagePayload(item) {
  if (!item) return null;
  if (typeof item.b64_json === 'string' && item.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (typeof item.url === 'string' && item.url.startsWith('data:')) {
    const m = item.url.match(/^data:[^;]+;base64,(.+)$/);
    if (m) return Buffer.from(m[1], 'base64');
  }
  return null;
}

/**
 * Same model order / form shape as HauntBooth electron openai:generateImage.
 */
export async function callOpenAiImageEdit(
  apiKey,
  pngBuf,
  fullPrompt,
  extraImages = [],
  size = '1536x1024',
  maskBuf = null,
  options = {},
) {
  const preferMax = !!options.preferMax;
  const auth = { Authorization: `Bearer ${String(apiKey || '').trim()}` };
  let lastErr = 'GPT image edit failed.';

  for (const model of GPT_IMAGE_EDIT_MODELS) {
    const form = buildGptImageEditForm(
      pngBuf,
      fullPrompt,
      extraImages,
      model,
      size,
      maskBuf,
      gptImageEditQuality(model, preferMax),
    );
    const gptRes = await httpsPostMultipart('https://api.openai.com/v1/images/edits', form, auth);
    let gptJson = null;
    try {
      gptJson = JSON.parse(gptRes.body);
    } catch {
      gptJson = null;
    }
    if (gptRes.statusCode >= 200 && gptRes.statusCode < 300 && gptJson) {
      const outBuf = decodeImagePayload(gptJson.data?.[0]);
      if (!outBuf) {
        lastErr = 'OpenAI returned no image data.';
        continue;
      }
      return { ok: true, outBuf, model };
    }
    lastErr =
      gptJson?.error?.message ||
      gptJson?.message ||
      gptRes.body.slice(0, 400) ||
      `HTTP ${gptRes.statusCode}`;
  }

  return { ok: false, error: lastErr };
}

export function buildEditPrompt(rawPrompt, pipeline) {
  const suffixParts = [];
  if (pipeline === 'head-swap') {
    suffixParts.push(
      "Image 1 is the Halloween character scene to edit (head region only, per mask). Image 2 (guest-face.png) is the guest IDENTITY reference — copy that person exactly. CRITICAL IDENTITY LOCK: preserve exact facial features, skin tone, eye shape/color, nose, lips, jawline, freckles, wrinkles, and all facial hair exactly as in image 2. Match hair from image 2. NATURAL HEAD SIZE: match the original character head size relative to the shoulders — do not enlarge, shrink oddly, or float the head higher. ANATOMY (portrait-critical): keep a natural short adult neck. Chin must sit immediately above / nestled into the costume collar with almost no visible throat gap — never elongate, stretch, or float the head. Softly blend only that short neck into the collar. Completely remove the old character head/hair with no oval outline, halo, or mask ring. Keep the costume body, pose, props, and scene identical to image 1. NEVER alter the guest face.",
    );
  } else {
    suffixParts.push(
      'BLEND ONLY — do not regenerate people. Preserve every guest exactly as placed: faces, bodies, arms, legs, feet, clothing, pose, and count. NEVER invent extra legs, limbs, torsos, or people. Only replace the indoor booth/room background around them with Halloween scenery. Softly match lighting on clothing edges. Photorealistic.',
    );
  }
  return `${String(rawPrompt || '').trim()} ${suffixParts.join(' ')}`;
}

export const HEAD_SWAP_INPAINT =
  "CLEAN SEAMLESS HEAD REPLACEMENT WITH NATURAL PORTRAIT ANATOMY. Image 1 is this Halloween character scene with a small guest-head reference on the character. Image 2 is a tight crop of the guest's real head. Replace the character head with the guest at NATURAL PROPORTION — the head must match the original character head size relative to the shoulders (do not enlarge or float the head higher). Exact guest likeness: eyes, nose, mouth, jaw, skin, hair. ANATOMY (critical for portrait): Keep a natural, short adult neck. Preserve the original Image-1 vertical distance from chin to shoulders/collar — if anything, sit the chin slightly closer to the collar. The chin must sit nestled into / immediately above the costume collar — no tall gap of neck skin, no elongated or stretched neck, no floating head. Do not raise the head above the original character head position. Completely erase the old character head/hair. NO oval outline, cutout edge, mask ring, or halo. Softly blend only that short neck into the collar. Keep the costume body, pose, props, camera angle, and lighting unchanged. Do not copy guest clothing or booth background. NEVER alter the guest face.";

export const HALLOWEEN_SCENE_INPAINT =
  `BLEND the guests into this Halloween scene — do not recreate them. CRITICAL: keep every person exactly as placed (faces, bodies, legs, feet, clothing, pose, count). NEVER invent extra legs, limbs, or people. Only replace the indoor room/booth background around them with matching Halloween atmosphere, lighting, and depth. Soft natural contact shadows under feet. Photorealistic. No face filters, no costume makeup, no identity change, no body regeneration.`;
