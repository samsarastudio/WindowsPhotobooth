# Signage player

Open `/signage` from **Admin → Open signage**, or use `/signage?layout=landscape` and `/signage?layout=portrait` on display devices. Auto follows screen orientation. Enter full screen with the button; controls disappear after inactivity and return with pointer or keyboard input.

The player downloads each complete MP4 once, stores a Blob in IndexedDB, and loops a local Blob URL. Both layouts are cached independently with a content hash. Reloads reuse the saved video. If persistent storage is unavailable, playback uses memory. A failed manifest or video download falls back to the previous cached video. An already-open player continues when disconnected; offline navigation/reloading the HTML page is not supported. Screen wake lock is used when the browser permits it; otherwise configure the display's sleep settings.

To publish the locally rendered videos, first run the signage validation script, then from the repository root:

```
node moments-server/scripts/publish-signage.mjs output/signage/current-app
```

Deploy `public/assets/signage/` with the server, including its manifest and both hashed MP4 files. The manifest is written only after both assets are copied. Keep older hashed files until connected devices have updated. Click **Check for update** or reload the player to load a new version. Do not replace the file behind an existing hash.

Browser regression test: `node moments-server/scripts/test-signage.cjs`. Install Playwright or set `PLAYWRIGHT_MODULE` to an available Playwright package; Chrome is required. The test starts an isolated Moments server with a temporary database and uses the published local videos.
