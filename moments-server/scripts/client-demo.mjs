// Local-only disposable preview. Never used by the production entry point.
import { createClientApp } from "../src/client/server.js";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const service = createClientApp({
  dataDir: path.join(root, "output/client-preview"),
  adminPassword: "demo-password-2026",
  sessionSecret: "local-preview-only-secret-2026-not-for-production",
  baseUrl: "http://127.0.0.1:3022",
  secureCookies: false,
});
const server = service.app.listen(3022, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = "http://127.0.0.1:3022";
const login = await fetch(base + "/api/admin/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: "demo-password-2026" }),
});
const cookie = login.headers.get("set-cookie").split(";")[0];
const request = async (route, data, method = "POST") => {
  const r = await fetch(base + route, {
    method,
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw Error(JSON.stringify(j));
  return j;
};
const list = await (
  await fetch(base + "/api/admin/collections", { headers: { cookie } })
).json();
if (!list.some((c) => c.slug === "demo-gallery")) {
  const c = await request("/api/admin/collections", {
    title: "Studies in light",
    slug: "demo-gallery",
    date: "2026-11-24",
    description:
      "A local demonstration collection. Abstract artwork for layout and delivery testing.",
    design: {
      coverStyle: "outline",
      palette: "light",
      typography: "timeless",
      thumbnailSize: "large",
    },
  });
  const colors = [
    ["#cbb29a", "#46584b"],
    ["#bfd3d1", "#335e65"],
    ["#e8c8ad", "#a36b52"],
    ["#c9ccad", "#4c6250"],
    ["#d6c4ba", "#6a555e"],
    ["#d1d9e0", "#536676"],
  ];
  const form = new FormData();
  for (let i = 0; i < 8; i++) {
    const [a, b] = colors[i % colors.length],
      w = i % 3 === 1 ? 900 : 1500,
      h = i % 3 === 1 ? 1350 : 1000;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.25}" r="${w * 0.12}" fill="#fff" opacity=".45"/><path d="M0 ${h * 0.7} Q${w * 0.3} ${h * 0.3} ${w * 0.6} ${h * 0.75} T${w * 1.3} ${h * 0.5} V${h} H0Z" fill="${b}" opacity=".7"/><path d="M0 ${h * 0.9} Q${w * 0.5} ${h * 0.5} ${w} ${h * 0.95} V${h} H0Z" fill="${a}" opacity=".55"/><text x="${w * 0.06}" y="${h * 0.94}" font-family="Georgia" font-size="24" fill="white" opacity=".7">LIGHT STUDY ${i + 1} · DEMO ARTWORK</text></svg>`;
    form.append(
      "files",
      new Blob([await sharp(Buffer.from(svg)).jpeg().toBuffer()], {
        type: "image/jpeg",
      }),
      `light-study-${i + 1}.jpg`,
    );
  }
  const u = await fetch(base + "/api/admin/collections/" + c.id + "/photos", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const uploaded = await u.json();
  if (!u.ok) throw Error(JSON.stringify(uploaded));
  await request(
    "/api/admin/collections/" + c.id,
    { status: "published", coverId: uploaded.photos[0].id },
    "PATCH",
  );
}
console.log(
  "Local Client Gallery preview: http://127.0.0.1:3022/g/demo-gallery",
);
console.log("Local admin: http://127.0.0.1:3022/admin (demo-password-2026)");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
