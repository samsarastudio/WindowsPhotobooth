# Release 1.1.53 — tablet printing and PNG frames

Both AI background and character portrait modes default to the Thank You screen after the guest approves their capture. Generation continues in the background and uploads its result for tablet printing. The versioned release migration enables this flow on upgrades while preserving the booth ID, timeout, printer, camera and credentials. Operators can change the setting after migration.

Moments Admin → Frames now includes a local PNG generator: upload artwork, choose a font, edit title/subtitle/tagline, adjust the existing nameplate thickness and text positions, then download a PNG or save it to the shared frame library. The export retains source dimensions and alpha. Blank landscape/portrait Halloween artwork is included. Font choices include the Screampark distressed style, Halloween Horror and system fonts for other occasions. No cloud generation or credits are used by the generator.

The tablet page shows a large selected photo above an eight-image filmstrip, numbered pages, timestamps and print status. Selection survives new captures and polling. Processing photos and queued prints cannot be sent again. Moments Admin Photos also uses a paginated bottom filmstrip.

Signage uses marketing copy, a taller illustrated nameplate and a larger single-line footer. Prices remain CAD $10 / $15 / $25, with the AI offer inside the magnet box.

## Test scenarios and results

| Scenario | Evidence | Result |
|---|---|---|
| Single guest and group background composition | Actual BiRefNet/face detection, 3 scenes × 3 depths × 2 inputs; protected face/unlit subject and exposed background pixels compared | 18 passed |
| Portrait input validation and all seven character masks | Actual app preparation; multiple faces rejected for single-person portraits | Passed |
| Seven existing portrait outputs | Actual app preparation, recorded OpenAI responses, lighting and makeup finishing; female sources for Witch, Pirate and Countess | Reprocessed successfully |
| Capture approval and retake | Production Angular build with mocked camera/API boundary | Passed |
| Standard print, framed print, magnet, share and retry | Production Angular browser scenarios with mocked printer/API boundary | Passed |
| Scene and portrait → Thank You | Production Angular browser scenarios | Passed |
| Concurrent captures and delayed upload | Routing/service tests, preserved background choice and processing status | Passed |
| Tablet pagination/selection/timestamp/processing lock | Real Chrome, mocked tablet responses, 19–20 items and empty state at tablet size | Passed |
| PNG output and upload | Actual browser PNG rendering at both orientations; dimensions/alpha checks; isolated server upload byte comparison | Passed |
| Print queue auth, deduplication, booth targeting and acknowledgement | Real isolated Moments server; no physical printer | Passed |
| Production upgrade | Versioned migration, backups, idempotency, protected settings; packaged defaults inspected | Passed |
| Frames | Actual app compositor, opening coverage at both scales and orientations | Passed |
| Regression repairs | Reserved analytics sources and empty frame library across server restart | Passed |

No new OpenAI or Comfy generation requests were made during this release qualification. Portrait tests replay previously generated API responses; they do not certify current upstream API availability. Physical DSLR capture and paper output require a hardware acceptance check. The Angular build retains one existing 238-byte stylesheet budget warning.

## Reproduce

From repository root (Node dependencies installed in both applications):

```text
node photobooth-app/scripts/setup-ai-models.cjs
node photobooth-app/scripts/setup-qa-fixtures.cjs
node photobooth-app/scripts/test-ai-flow.cjs
node photobooth-app/scripts/qa-six-backgrounds.cjs
node photobooth-app/scripts/test-ai-routing.cjs
node photobooth-app/scripts/test-ota-assets.cjs
node photobooth-app/scripts/test-horror-frame.cjs
node photobooth-app/scripts/test-character-makeup.cjs
node photobooth-app/scripts/test-portrait-lighting.cjs
node photobooth-app/scripts/test-portrait-framing.cjs
node photobooth-app/scripts/test-printer-readiness.cjs
node moments-server/scripts/test-release-browser.mjs
node moments-server/scripts/qa-production.mjs
node --test moments-server/test/physical-frame.test.mjs moments-server/test/tablet-instance.test.mjs
```

Build Angular before `node photobooth-app/scripts/test-guest-flow-browser.cjs`. Browser harnesses use the bundled Playwright path on the development workstation and installed Chrome. Tests use generated sample guests, not customer photos. `test-release-browser.mjs` writes PNG fixtures needed by `qa-production.mjs`.

## Deployment artifacts

Windows folder/OTA ZIP: `builds/PhotoBooth-Folder-1.1.53-20261022-050423.zip`. Upload through Moments Admin → Booth updates, using version 1.1.53. The native Canon bridge and DLLs are verified beside PhotoBooth.exe. Model binaries and configured credentials stay out of Git; the model setup script downloads and verifies model checksums.

Deploy the Moments server source/static assets from the same commit using the existing server deployment procedure. This release prepares artifacts; it does not restart the live service or roll out to booths automatically. Local signage MP4s remain under `output/signage/current-app/`; large export/build artifacts are excluded from Git.
