# Signage player

Open `/signage` from **Admin → Open signage**, or use `/signage?layout=landscape` and `/signage?layout=portrait` on display devices. Auto follows screen orientation. Enter full screen with the button; controls disappear after inactivity and return with pointer or keyboard input.

The player downloads each complete MP4 once, stores a Blob in IndexedDB, and loops a local Blob URL. Both layouts are cached independently with a content hash. Reloads reuse the saved video. If persistent storage is unavailable, playback uses memory. A failed manifest or video download falls back to the previous cached video. An already-open player continues when disconnected; offline navigation/reloading the HTML page is not supported. Screen wake lock is used when the browser permits it; otherwise configure the display's sleep settings.

To publish the locally rendered videos, first run the signage validation script, then from the repository root:

```
node moments-server/scripts/publish-signage.mjs output/signage/current-app
```

Named campaigns: pass `video2` as the final publish argument to publish a separate Video 2 manifest and make it the default. Use `/signage?video=2&layout=portrait` (or `landscape`) to pin a display to that campaign. The original campaign remains available via `video1.json` and `?video=1`. Named campaigns have separate browser cache entries.

The **Video** dropdown switches between the default, Video 2, Video 3 and the original Video 1. Video 3 is portrait only: it uses portrait playback even on a landscape display (letterboxed), with layout selection disabled. Video 2 retains both layouts. Selection is saved in the URL; each campaign has its own reusable device cache.

Render Video 3 locally with `py output/signage/create_video3.py` (FFmpeg on PATH), then publish without replacing the default Video 2:

```
node moments-server/scripts/publish-signage.mjs output/signage/current-app/video3 video3 --portrait-only --keep-default
```

Video 3 opens with the $25 postcard, physical photo magnet and digital-copy set, then presents the $10 classic photo and a single before/after comparison of the $15 AI portraits before returning to the bundle. The 60-second schedule is 20 seconds bundle, 20 seconds classic, 8 seconds AI, and 12 seconds bundle. The AI comparison shows the original man and woman on the left and their six character possibilities on the right. Its inspiration is TED-Ed's [5 sneaky ways stores get you to spend more](https://www.youtube.com/watch?v=a_4eFB8pPwI), reviewed through its English transcript: product ordering and benefit framing inform the presentation, with real prices and inclusions and no invented original prices or scarcity claims. All animation/rendering uses existing local assets.

Deploy `public/assets/signage/` with the server, including its manifest and both hashed MP4 files. The manifest is written only after both assets are copied. Keep older hashed files until connected devices have updated. Click **Check for update** or reload the player to load a new version. Do not replace the file behind an existing hash.

Browser regression test: `node moments-server/scripts/test-signage.cjs`. Install Playwright or set `PLAYWRIGHT_MODULE` to an available Playwright package; Chrome is required. The test starts an isolated Moments server with a temporary database and uses the published local videos.

Video 3 inclusions: Classic Photo ($10) and AI Portrait ($15) each include one postcard-sized print and a digital copy. The $25 magnet set includes one postcard-sized print, one photo magnet and a digital copy. Print, physical photo magnet and phone thumbnails illustrate all three bundle deliverables; the small QR pictogram is labeled "QR sample" and is not a customer download link.

October 28 sample refresh: registration `/play` crossfades four reviewed Custom Backdrops outputs (two couple and two three-person shots). Pause and reduced-motion preferences are supported. Run `node scripts/test-game-samples.cjs` from this directory for the sample browser check. Local source preparation from the repository root: `node moments-server/scripts/update-curtain-samples.cjs`. This requires the reviewed `output/curtain-*-qa-2026-10-28` source folders. Re-render Video 2 portrait and Video 3 after preparation; each now shows all four backdrops within the scene sequence. Portrait character samples and prices remain from the existing campaign.
