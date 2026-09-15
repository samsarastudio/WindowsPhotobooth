import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  PHYSICAL_FRAME_DEFAULTS,
  compositePhysicalFrameDual,
  normalizePhysicalOpts,
  resolveSheetRects,
  validateSheetLayout,
} from '../src/physical-frame.js';

async function markerPhoto({ label = 'MAIN', w = 1200, h = 800, color = '#2266aa' } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="${color}"/>
  <rect x="0" y="0" width="80" height="80" fill="#ff0000"/>
  <rect x="${w - 80}" y="0" width="80" height="80" fill="#00ff00"/>
  <rect x="0" y="${h - 80}" width="80" height="80" fill="#0000ff"/>
  <rect x="${w - 80}" y="${h - 80}" width="80" height="80" fill="#ffff00"/>
  <text x="50%" y="50%" text-anchor="middle" font-size="72" fill="#fff" font-family="Arial">${label}</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function nameplateArt({ label = 'NAME', w = 800, h = 120 } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="100%" height="100%" fill="#f7f3ea"/>
  <text x="20" y="70" font-size="48" fill="#2f5d3a" font-family="Arial">EDGE-L ${label} EDGE-R</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test('default nameplate layout rectangles match guide at 300 DPI', () => {
  const opts = normalizePhysicalOpts({
    ...PHYSICAL_FRAME_DEFAULTS,
    nameplateEnabled: true,
  });
  const { photoCells, nameplates, pageW, pageH } = resolveSheetRects(opts, 300);
  assert.equal(pageW, 1748);
  assert.equal(pageH, 1181);
  assert.deepEqual(photoCells[0], { x: 225, y: 130, width: 626, height: 921 });
  assert.deepEqual(photoCells[1], { x: 898, y: 130, width: 626, height: 921 });
  assert.equal(nameplates.length, 1);
  assert.deepEqual(nameplates[0], { x: 1548, y: 284, width: 100, height: 614 });
  validateSheetLayout(opts, 300);
});

test('photo-only sheet has no nameplate and correct size/density', async () => {
  const photo = await markerPhoto();
  const sheet = await compositePhysicalFrameDual(photo, { borderEnabled: false });
  assert.equal(sheet.width, 1748);
  assert.equal(sheet.height, 1181);
  assert.equal(sheet.layout.nameplates.length, 0);
  const meta = await sharp(sheet.png).metadata();
  assert.equal(meta.density, 300);
});

test('two-input sheet places one nameplate and keeps photo cells', async () => {
  const photo = await markerPhoto({ label: 'MAIN' });
  const plate = await nameplateArt({ label: 'PLATE' });
  const sheet = await compositePhysicalFrameDual(
    photo,
    { borderEnabled: false, nameplateEnabled: true },
    plate,
  );
  assert.equal(sheet.width, 1748);
  assert.equal(sheet.height, 1181);
  assert.equal(sheet.layout.nameplates.length, 1);
  assert.deepEqual(sheet.layout.nameplates[0], { x: 1548, y: 284, width: 100, height: 614 });
  const meta = await sharp(sheet.png).metadata();
  assert.equal(meta.density, 300);
});

test('enabled without buffer throws', async () => {
  const photo = await markerPhoto();
  await assert.rejects(
    () => compositePhysicalFrameDual(photo, { nameplateEnabled: true }, null),
    /nameplate/i,
  );
});

test('oversized cells reject nameplate layout', () => {
  assert.throws(() => {
    validateSheetLayout(
      normalizePhysicalOpts({
        cellWidthCm: 7.2,
        cellHeightCm: 7.8,
        nameplateEnabled: true,
      }),
      300,
    );
  }, /insufficient room for the nameplate/i);
});
