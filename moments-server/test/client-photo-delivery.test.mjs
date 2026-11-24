import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../client-public/photo-delivery.js", import.meta.url),
  "utf8",
);
function setup(overrides = {}) {
  const ctx = vm.createContext({
    File,
    navigator: { share() {}, canShare: () => true },
    fetch: async () => ({
      ok: true,
      blob: async () =>
        new Blob(["image"], { type: "application/octet-stream" }),
    }),
    ...overrides,
  });
  vm.runInContext(source, ctx);
  return ctx.PhotoDelivery;
}
test("prepares image file with correct MIME for native Photos sharing", async () => {
  const file = await setup().prepare("/download/token", "portrait.JPG");
  assert.equal(file.type, "image/jpeg");
  assert.equal(file.name, "portrait.JPG");
  assert.equal(await file.text(), "image");
});
test("unsupported browsers do not fetch image files", async () => {
  const delivery = setup({
    navigator: {},
    fetch: () => {
      throw new Error("must not fetch");
    },
  });
  assert.equal(await delivery.prepare("/download/token", "photo.jpg"), null);
});
test("unsupported file sharing, HTTP errors and invalid response content fall back", async () => {
  assert.equal(
    await setup({ navigator: { share() {}, canShare: () => false } }).prepare(
      "/download/token",
      "photo.png",
    ),
    null,
  );
  assert.equal(
    await setup({ fetch: async () => ({ ok: false }) }).prepare(
      "/download/token",
      "photo.jpg",
    ),
    null,
  );
  assert.equal(
    await setup({
      fetch: async () => ({
        ok: true,
        blob: async () => new Blob(["error"], { type: "text/html" }),
      }),
    }).prepare("/download/token", "photo.jpg"),
    null,
  );
  assert.equal(await setup().prepare("/download/token", "photos.zip"), null);
});
