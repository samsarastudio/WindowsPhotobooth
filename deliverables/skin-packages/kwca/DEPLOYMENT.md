# KWCA release — 21 November 2026

PhotoBooth 1.3.2 OTA is uploaded and active on moments.inmomentservices.com.

- Release ID: `Hbakb2ZeO-rQ`; build: `20261121-kwca-poses`.
- Archive: 600773948 bytes.
- SHA-256: `23bed5b33d609468dc78dc4c6a1079e73937b0da685b14ee283842a4f4be395e`.
- Local archive: `C:/Users/Unity/.codex/builds/PhotoBooth-1.3.2/PhotoBooth-Folder-1.3.2-20261121-kwca-poses-ota.zip`.
- BiRefNet is retained; unused U2Net is omitted to fit the server upload limit.

## Booth setup after OTA

In Admin → Themes, import `skin-packages-to-import/sports-cricket-1.3.1.booth.zip` beside PhotoBooth.exe, then apply it. Existing installed skins and settings are preserved by OTA; this explicit import installs the updated artwork and two-scene menu.

The new package contains only KWCA Players Pavilion and KWCA Trophy Gallery, each with original close/medium/wide depth logic. It includes the refined gold/orange team card design. The app has a simplified collage screen with optional controls collapsed, per-person effects and ordering, and background queue processing enabled by default.

## Verification

Packaged app capture tests passed: two backdrop choices, consecutive captures, effect/reorder persistence, a second family captured while the first processes, both queued cards completed, and foreground review/edit. Desktop and narrow-screen layout checks passed. See `qa-1.3.2/report.json` and previews. Physical printing and live gallery delivery were not exercised in this test.

## Remaining manual server deployment

The live package catalog endpoint `/api/admin/booth-packages` still returns 404. Deploy the package catalog integration using `moments-server/docs/booth-packages.md`, preserving the Gallery checkout's local configuration and data. Then upload and publish `deliverables/skin-packages/sports-cricket-1.3.1.booth.zip` (requires PhotoBooth 1.3.2).

The existing Gallery frame library already contains the compact KWCA frames `cricket-landscape.png` and `cricket-portrait.png`. Sources remain in `skin-packages/sports-cricket/config/photo-frames`; `node scripts/publish-kwca-frames.cjs` republishes these two filenames. Uploading frames alone does not install the team-card skin package.
