import test from "node:test";
import assert from "node:assert/strict";
import { layoutPhotos } from "../client-public/gallery-layout.js";
const ratios = [
  1.78, 0.67, 0.56, 0.56, 0.56, 1.78, 0.56, 0.56, 1.78, 0.56, 0.56,
];
test("Phone galleries stack full-width uncropped photos for every desktop setting", () => {
  for (const width of [312, 367, 382, 422, 592])
    for (const layout of ["vertical", "horizontal"])
      for (const large of [false, true])
        for (const gap of [8, 40]) {
          const { boxes, height } = layoutPhotos(ratios, width, { mobile: true, layout, large, gap });
          boxes.forEach((box, i) => {
            assert.equal(box.x, 0);
            assert.equal(box.width, width);
            assert.equal(box.height, width / ratios[i]);
            assert.equal(box.y, i ? boxes[i - 1].y + boxes[i - 1].height + 4 : 0);
          });
          const last = boxes.at(-1);
          assert.equal(height, last.y + last.height);
        }
});
test("Masonry fills the shortest column in source order", () => {
  const { boxes } = layoutPhotos(ratios, 1600, { large: true });
  assert.equal(boxes[0].y, 0);
  assert.equal(boxes[1].y, 0);
  assert.equal(boxes[2].y, 0);
  assert.equal(boxes[3].x, boxes[0].x);
  assert.ok(boxes[3].y > 0);
});
test("Every size and layout preserves ratios without overlap or overflow", () => {
  for (const width of [320, 390, 768, 1600, 1920])
    for (const layout of ["vertical", "horizontal"])
      for (const large of [false, true])
        for (const gap of [8, 40]) {
          const { boxes, height } = layoutPhotos(ratios, width, {
            layout,
            large,
            gap,
            mobile: width <= 600,
            tablet: width > 600 && width <= 1000,
          });
          boxes.forEach((b, i) => {
            assert.ok(Math.abs(b.width / b.height - ratios[i]) < 1e-9);
            assert.ok(
              b.x >= 0 &&
                b.y >= 0 &&
                b.x + b.width <= width + 1e-6 &&
                b.y + b.height <= height + 1e-6,
            );
            boxes
              .slice(i + 1)
              .forEach((c) =>
                assert.ok(
                  b.x + b.width <= c.x + 1e-6 ||
                    c.x + c.width <= b.x + 1e-6 ||
                    b.y + b.height <= c.y + 1e-6 ||
                    c.y + c.height <= b.y + 1e-6,
                ),
              );
          });
        }
});
test("Large is larger; final portrait row never stretches", () => {
  for (const layout of ["vertical", "horizontal"]) {
    const a = layoutPhotos(ratios, 1600, { layout });
    const b = layoutPhotos(ratios, 1600, { layout, large: true });
    assert.ok(b.boxes[0].width > a.boxes[0].width);
  }
  const { boxes } = layoutPhotos([0.56], 1600, { layout: "horizontal" });
  assert.ok(boxes[0].width < 200);
});
