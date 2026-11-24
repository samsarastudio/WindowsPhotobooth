// Local/operator upload helper; credentials and photographs are never committed.
import fs from "node:fs/promises";
import path from "node:path";
const source = process.argv[2];
if (!source || !process.env.CLIENT_IMPORT_PASSWORD)
  throw Error(
    "Usage: CLIENT_IMPORT_PASSWORD=<admin password> node scripts/client-import-folder.mjs <folder>. Optional CLIENT_IMPORT_URL, CLIENT_IMPORT_TITLE.",
  );
const base = (process.env.CLIENT_IMPORT_URL || "http://127.0.0.1:3022").replace(
  /\/$/,
  "",
);
const request = async (route, body, method = "POST", cookie = "") => {
  const response = await fetch(base + route, {
    method,
    headers: {
      cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || String(response.status));
  return { data, response };
};
const { response: login } = await request("/api/admin/login", {
  password: process.env.CLIENT_IMPORT_PASSWORD,
});
const cookie = login.headers.get("set-cookie").split(";")[0];
const files = (await fs.readdir(source, { withFileTypes: true }))
  .filter((f) => f.isFile() && /\.(jpe?g|png|webp|tiff?|avif)$/i.test(f.name))
  .map((f) => f.name)
  .sort();
if (!files.length) throw Error("No supported photographs found");
const { data: collection } = await request(
  "/api/admin/collections",
  {
    title: process.env.CLIENT_IMPORT_TITLE || path.basename(source),
    design: {
      coverStyle: "outline",
      palette: "light",
      typography: "timeless",
      thumbnailSize: "large",
    },
  },
  "POST",
  cookie,
);
let cover;
for (const [i, name] of files.entries()) {
  const form = new FormData();
  form.append(
    "files",
    new Blob([await fs.readFile(path.join(source, name))]),
    name,
  );
  const { data } = await request(
    "/api/admin/collections/" + collection.id + "/photos",
    form,
    "POST",
    cookie,
  );
  cover ??= data.photos[0]?.id;
  console.log(`Uploaded ${i + 1}/${files.length}: ${name}`);
}
await request(
  "/api/admin/collections/" + collection.id,
  { coverId: cover },
  "PATCH",
  cookie,
);
console.log(`Imported as draft: ${base}/g/${collection.slug}`);
console.log(
  `Collection ID: ${collection.id}. Review and publish in ${base}/admin.`,
);
