# Hauntbooth 1.1.62

This is the standalone Hauntbooth release. Halloween Hero is maintained in an independent project; its routes, controller, configuration and artwork are excluded from this app and its Windows package.

## Preserved features

- Zoom plus mouse/touch dragging in photo crop previews, with the actual frame and nameplate visible.
- Standard photo, background preview, tablet handoff, gallery framing and magnet crop flows.
- Portrait and landscape postcard orientation, framed-photo margins and correct magnet print payloads.
- Separate portrait/background preview settings, server portrait retry handling and cached portrait thumbnails.
- Local background processing in an isolated worker, with subject framing and existing depth-aware scenes.
- Haunted Harvest Carnival, Witch Lantern Garden and Vampire Candlelit Ballroom backgrounds, including upgrade seeding that preserves custom artwork and settings.

## Validation on the Windows folder build

The rebuilt app passed gallery frame/crop and magnet creation tests, standard/background crop tests with both mouse and browser-emulated touch dragging, and print orientation tests for plain/framed portrait and landscape photos. Print requests were intercepted; no physical prints were submitted. Background removal ran locally with a responsive parent process. Hardware DSLR capture and physical output still require an on-site check.

The release-content check verifies the camera bridge, AI models and all three vibrant backgrounds, and rejects Hero files/hooks or local operator configuration in the shipped package. The frontend builds with the existing admin stylesheet size warning.

Relevant checks:

```powershell
node --test scripts/test-subject-framing.cjs scripts/test-portrait-retry.cjs scripts/test-portrait-thumbnails.cjs scripts/test-vibrant-scenes.cjs scripts/test-stock-frame-refresh.cjs scripts/test-ota-assets.cjs scripts/test-preview-settings.cjs
npx ng build --configuration production
npx electron-builder --win dir
node scripts/test-gallery-actions.cjs
node scripts/test-scene-crop-review.cjs
node scripts/test-print-orientation.cjs
node scripts/test-scene-process.cjs
node scripts/test-release-isolation.cjs
```

The desktop flow checks use the existing local QA photographs/runtime fixtures; they do not call paid AI generation. Use `scripts/package-ota.ps1` to produce the checked folder ZIP and SHA-256 manifest after building.
