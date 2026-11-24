import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export async function watermark(input, mark, data) {
  if (!mark) return input;
  const meta = await sharp(input).metadata();
  const w = meta.width,
    h = meta.height;
  const scale = Math.max(3, Math.min(60, Number(mark.scale) || 18)) / 100;
  const opacity = Math.max(
    0,
    Math.min(
      1,
      Number(mark.opacity) > 1
        ? Number(mark.opacity) / 100
        : Number.isFinite(Number(mark.opacity))
          ? Number(mark.opacity)
          : 0.45,
    ),
  );
  const mw = Math.min(w, Math.max(10, Math.round(w * scale)));
  let overlay;
  if (
    mark.type === "image" &&
    /^\/assets\/[a-zA-Z0-9.-]+$/.test(mark.imageUrl || "")
  ) {
    const image = path.join(data, "assets", path.basename(mark.imageUrl));
    if (!fs.existsSync(image)) return input;
    const png = await sharp(image)
      .resize({ width: mw, height: Math.round(h * 0.3), fit: "inside" })
      .ensureAlpha()
      .toBuffer();
    const m = await sharp(png).metadata();
    overlay = await sharp(png)
      .composite([
        {
          input: Buffer.from(
            `<svg width="${m.width}" height="${m.height}"><rect width="100%" height="100%" fill="white" opacity="${opacity}"/></svg>`,
          ),
          blend: "dest-in",
        },
      ])
      .png()
      .toBuffer();
  } else {
    const font = Math.max(
      12,
      Math.round(
        (mw /
          Math.max(6, String(mark.text || mark.name || "In Moment").length)) *
          1.65,
      ),
    );
    overlay = Buffer.from(
      `<svg width="${mw}" height="${font * 2}"><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${font}" fill="white" stroke="black" stroke-width=".3" opacity="${opacity}">${escape(mark.text || mark.name || "In Moment")}</text></svg>`,
    );
  }
  let m = await sharp(overlay).metadata();
  if (m.width > w || m.height > h) {
    overlay = await sharp(overlay)
      .resize({ width: w, height: h, fit: "inside" })
      .png()
      .toBuffer();
    m = await sharp(overlay).metadata();
  }
  const pos = String(mark.position || "bottom-right");
  const pad = Math.round(Math.min(w, h) * 0.025);
  const left = pos.includes("left")
    ? pad
    : pos.includes("right")
      ? w - m.width - pad
      : Math.round((w - m.width) / 2);
  const top = pos.includes("top")
    ? pad
    : pos.includes("bottom")
      ? h - m.height - pad
      : Math.round((h - m.height) / 2);
  return sharp(input)
    .composite([
      { input: overlay, left: Math.max(0, left), top: Math.max(0, top) },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
export function embedUrl(raw) {
  try {
    const u = new URL(raw);
    if (["www.youtube.com", "youtube.com", "youtu.be"].includes(u.hostname)) {
      const id =
        u.hostname === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v");
      if (/^[a-zA-Z0-9_-]{11}$/.test(id || ""))
        return "https://www.youtube-nocookie.com/embed/" + id;
    }
    if (
      ["vimeo.com", "www.vimeo.com"].includes(u.hostname) &&
      /^\/\d+$/.test(u.pathname)
    )
      return "https://player.vimeo.com/video" + u.pathname;
  } catch {}
  return null;
}
