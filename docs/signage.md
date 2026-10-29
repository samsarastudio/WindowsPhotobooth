# Portrait signage player

Open `/signage` from Admin. The player shows only the latest 60-second portrait campaign, letterboxed on wider displays. Old `?video=` and `?layout=` bookmarks open this same current video. There are no campaign or layout selectors.

The player downloads the complete MP4 once, saves it in IndexedDB, and loops a local Blob URL. Successful caching of a new download removes older campaign blobs. Manifest or download failures can use the current cached video. If storage is unavailable, playback uses memory. Offline playback continues after loading; offline page navigation is not supported. Use **Check for update** after a deployment.

The campaign gives 32 seconds to the $25 set, 20 seconds to the $10 classic photo, and 8 seconds to a single $15 AI comparison: original man and woman on the left, six transformations on the right. The set preview shows postcard print + physical photo magnet + digital copy. Its QR pictogram is illustrative, not a guest download link.

Render and publish from the repository root:

```
py output/signage/create_video3.py
node moments-server/scripts/publish-signage.mjs output/signage/current-app/video3 --portrait-only
```

Deploy `public/assets/signage/manifest.json` and its referenced MP4. Superseded campaign manifests and videos have been removed from the deployment assets. Local source renders remain in `output/signage/`.

Registration `/play` crossfades four reviewed Custom Backdrops outputs: two couple and two three-person shots. Its 720x480 JPEG samples are about 81–85 KiB each. Pause and reduced-motion preferences are supported. Prepare from the reviewed local source folders with `node moments-server/scripts/update-curtain-samples.cjs`.

Browser checks: `node moments-server/scripts/test-game-samples.cjs` and `node moments-server/scripts/test-signage.cjs`. Set `PLAYWRIGHT_MODULE` if needed; Chrome must be available.
