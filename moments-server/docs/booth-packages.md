# Booth skin packages — app 1.3.0

A skin is a versioned, data-only ZIP containing its UI stylesheet, images/fonts, screen copy, background/depth sets, character compositions, photo frames and optional Christmas family-card artwork. **One initial update to PhotoBooth 1.3.0 is required.** Afterwards, skin changes do not replace the executable or restart the operating system. New executable features still require an app update.

## Manual Moments deployment

Changes are on `codex/moments-live-events` in the WindowsPhotobooth repository. Deploy the **Gallery service** (`moments-server/src/index.js`), not the separate Moments Live service (`src/live/index.js`). No database migration or new npm dependency is required.

For a monorepo checkout on the host:

```sh
git fetch origin codex/moments-live-events
# Merge/update your checkout using your normal deployment process.
cd moments-server
node --check src/routes/booth-packages.js
node scripts/import-booth-packages.mjs --publish
sudo systemctl restart moments-gallery
sudo systemctl is-active moments-gallery
```

The import command reads `../deliverables/skin-packages/*.booth.zip`, validates them, and copies them into the configured `DATA_DIR/booth-packages`. It is idempotent for identical releases and refuses to replace different content at the same ID/version. Omit `--publish` to import drafts for review. If packages are stored elsewhere, add `--from=/absolute/package/folder`.

For the existing **server-only / detached Gallery checkout**, do not reset it or replace `.env`, data or dependencies. Bring over these additions from this release:

- `src/routes/booth-packages.js`
- `src/lib/theme-package-format.cjs`
- `scripts/import-booth-packages.mjs`
- `public/booth-packages.html` and `public/booth-packages.js`

Apply only the small `src/index.js` integration diff (router import and two `app.use` lines), plus the `public/admin.html` link. Copy the three ZIP files to a staging folder on that host and run `node scripts/import-booth-packages.mjs --from=/absolute/staging/folder --publish`. Check the service and open `/booth-packages.html` after restarting Gallery. The unrelated Live service is unchanged.

In **Moments → Gallery admin → Booth skins**, enter the Moments admin PIN. Upload creates a draft; Publish makes that exact version available to booths. Unpublish prevents future downloads but does not disable installations already cached at an event. Existing URLs and photos remain unchanged. Keep these package files in server backups.

## Install and operate the booth

Build/distribute PhotoBooth 1.3.0 using the existing Windows build process (`npm ci`, `npm run electron:build:folder` in `photobooth-app`). Preserve each instance's existing writable configuration/capture folders. Each instance must have its own portable directory; two processes sharing one writable directory are not independent booths.

1. Configure the existing Moments URL and upload token in booth admin.
2. Open **Admin → Themes**, enter the booth admin PIN, and choose **Browse Moments**.
3. Download a package. This only installs it; it does not affect a guest session.
4. Between guest sessions, choose **Apply skin**. The UI reloads through Electron with that package's copy, styling and asset directories.
5. Use **Roll back** to return to the previously selected package, or **Use built-in settings** to return to the pre-package configuration.

**Import package ZIP** supports offline/USB installation. Installed packages work with no server connection. Capture, background removal, frames and local print behavior retain their existing offline capabilities; gallery delivery still needs connectivity and uses the existing retry queue.

Package activation changes only the selected portable instance. Camera selection, printer calibration, booth identity, gallery URL/token, admin PIN, saved photos and upload queue are not supplied by packages. Per-package AI enablement, guest-mode toggles and copy adjustments are saved separately from the original instance configuration. Package artwork and frame definitions are read-only; publish a new package version to change them.

Activation is blocked while scene or family-card work is queued/processing. Family-card drafts also record the package version needed for later retries. Active and previous package versions cannot be deleted; a package needed by a failed/retryable family card is retained too. Remote frame sync is bypassed while a package is active, preventing the shared legacy frame catalog from replacing package artwork.

## Included packages

| ID | Version | Contents |
| --- | --- | --- |
| `christmas` | 1.0.0 | Existing Christmas scene/depth sets, character plates, Merry Christmas photo frames, menu imagery, typography and 1–10-person family card artwork |
| `halloween` | 1.0.0 | Original HauntBooth artwork/config from the pinned `codex/hauntbooth-1.1.62-isolated` revision; missing app-folder frames sourced from that same revision's server seed frames |
| `sports-cricket` | 1.0.0 | Match Day styling; Stadium Lights, Pavilion Club and Players’ Entrance backgrounds; transparent 6×4 landscape and 4×6 portrait frames; local background removal; no AI character portraits or Christmas family-card entry |

Cricket uses navy, emerald, ivory and warm gold with restrained wicket/ball details. Scene centres remain open and the original subject-framing/background-removal pipeline is unchanged. Cricket v1 contains three single plates, not synthetic zoomed depth variants; seasonal depth variants are preserved. No team, league or sponsor marks are included. Gallery sharing, standard photo and physical keepsake flows use the existing booth functionality.

Images are converted to lossless WebP inside the package when this reduces size. Source artwork is unchanged; references and depth-plate checksums are updated together. ZIPs are approximately 66 MB, 49 MB and 1.4 MB respectively. Exact inventories/checksums are in the companion manifests.

## Package contract

At ZIP root: `package.json`. Required fields: `schemaVersion: 1`, lowercase hyphenated `id`, three-part numeric `version` and `minAppVersion`, `name`, `config`, `files` (relative filename → SHA-256). All payload files must be inventoried; ZIPs have no enclosing folder.

Required: `theme/theme.json` (matching ID), `theme/styles.css`.

Typical directories: `theme/assets`, `theme/fonts`, `theme/artwork`, `presentation`, `config/ai-backgrounds/<mode>`, `config/compositions/<mode>`, `config/photo-frames`.

Allowed config keys: `aiModes`, `defaultAiModeId`, `aiGenerationEnabled`, `guestModes`, `photoFrames`, `copy`. QR bypass codes are not package copy. `presentation` declares packaged hero/menu assets and the existing `familyCardEnabled` capability. A capability enables an already implemented feature; packages cannot install code.

Maximum ZIP: **90 MiB**; maximum unpacked size: 400 MiB; maximum entries: 2,000; maximum individual file: 80 MiB. Accepted payload types: JSON, CSS, PNG/JPG/WebP, TTF/WOFF2, TXT/Markdown. Executables, JS, HTML, SVG, symlinks, encrypted ZIPs, ZIP64, path traversal, Windows device names, duplicate/case-colliding entries, prototype keys, remote CSS/imports, missing references and incorrect checksums are rejected. Use a normal ZIP writer with stored or deflate compression.

Downloads require the existing booth upload token over HTTPS (localhost HTTP is permitted for QA). The booth obtains size/hash from its configured authenticated Moments catalog, checks the archive hash, validates every file, stages extraction, then renames the completed version into place. Activation verifies installed hashes and atomically writes a small pointer. Server upload/publish requires the Moments admin PIN; booth management requires its own admin PIN. This is authenticated transport and content validation, not an offline digital-signature scheme: only import ZIPs from your trusted operator.

## Authoring and verification

`python scripts/build-skin-packages.py` rebuilds the curated ZIPs; Node and the app's Sharp dependency must be installed. `scripts/design-cricket-package.cjs` contains the deterministic print-frame/UI asset design. The cricket scene sources already live in `skin-packages/sports-cricket`, so deployment does not require ImageGen. Generative art provenance is recorded there.

```sh
node --test photobooth-app/scripts/test-skin-packages.cjs moments-server/test/booth-packages.test.mjs
npm run build --prefix photobooth-app
node photobooth-app/scripts/qa-skin-packages.cjs
```

QA uses isolated temporary booth/server data and prerecorded image fixtures, with printing disabled. It never changes production galleries, tokens, installed skins or paid AI-generation limits. Hardware printing/Canon capture and paid AI portraits are outside this validation. The test report/screenshots are generated in ignored `output/skin-packages-qa`.
