import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { captureDate } from "../src/client/capture-date.js";
test("reads original capture time from real EXIF and tolerates missing or corrupt metadata", async () => {
  const photo = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "red" },
  })
    .withExif({ IFD2: { DateTimeOriginal: "2026:11:24 14:30:05" } })
    .jpeg()
    .toBuffer();
  assert.equal(
    captureDate((await sharp(photo).metadata()).exif),
    "2026-11-24T14:30:05",
  );
  assert.equal(captureDate(undefined), null);
  assert.equal(captureDate(Buffer.from("Exif\0\0IIbroken")), null);
});
