# KWCA release — 18 November 2026

- PhotoBooth 1.3.1 OTA is uploaded and active on moments.inmomentservices.com.
- OTA release ID: `DvBMpyXUspoB`; build: `20261118-kwca`.
- Server archive: 592869345 bytes; SHA-256 `ad3e935cad26e084658794ad6e9275e448e7f2a7fe2a034672b53cc380bbd569`.
- Uploadable local archive: `C:/Users/Unity/.codex/builds/PhotoBooth-1.3.1/PhotoBooth-Folder-1.3.1-20261118-kwca-ota.zip`.
- This archive retains BiRefNet and omits the unused U2Net model to fit the server's 600 MB upload limit.
- Both current frames are uploaded to the existing Gallery admin frame library: `cricket-landscape.png` and `cricket-portrait.png`. Downloaded bytes were verified against the originals.

Frame sources remain in `skin-packages/sports-cricket/config/photo-frames`. Run `node scripts/publish-kwca-frames.cjs` from the repository to republish them using the local Moments admin credentials. This explicitly replaces these two filenames; other frames are untouched.

## Remaining manual server deployment

The live server currently returns 404 for `/api/admin/booth-packages`. Deploy the package catalog integration using `moments-server/docs/booth-packages.md`. Preserve the existing Gallery checkout's local configuration and data; do not replace it with the independent Moments Live service.

Then upload and publish `deliverables/skin-packages/sports-cricket-1.3.0.booth.zip`. It requires PhotoBooth 1.3.1 and includes the KWCA 1–10-person card, leafy shared dividers, compact branded frames and existing backdrop depth variants. Booth administrators can download and apply it after the app update.

Uploading frames to Gallery alone does not install the team-card package or enable its guest mode. The frame library and skin-package catalog are separate services.
