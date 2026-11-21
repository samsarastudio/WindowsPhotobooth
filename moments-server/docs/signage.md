# Portrait signage player

Open `/signage` from Admin. The player shows only the latest 30-second KWCA portrait campaign, letterboxed on wider displays. Old `?video=` and `?layout=` bookmarks open this same current video. There are no campaign or layout selectors.

The player downloads the complete MP4 once, saves it in IndexedDB, and loops a local Blob URL. Successful caching of a new download removes older campaign blobs. Manifest or download failures can use the current cached video. If storage is unavailable, playback uses memory. Offline playback continues after loading; offline page navigation is not supported. Use **Check for update** after a deployment.

The current KWCA campaign uses the branded Trophy Hall and Players Pavilion backdrops, followed by four- and six-person team postcards. The prominent FREE DIGITAL COPY banner stays visible throughout. The print offer is **Physical printed copies $5**. There are no magnet or AI-portrait offers. The video is 1080x1920, 30 fps, H.264, silent, with animated cards and crossfades including the loop boundary.

Approved media: `public/assets/signage/kwca-portrait-48c24462ca5f0b23.mp4` (3,225,712 bytes). SHA-256: `48c24462ca5f0b239c910cbb4810281a466e16eeff2393878067ab1cb8559b90`.

Source renderer: `scripts/build-kwca-signage.py`. It uses the retained KWCA samples in the monorepo and writes to `KWCA_SIGNAGE_OUTPUT` (or the user's `.codex/builds/kwca-signage` folder). Generated media is decoded before its manifest is produced.

## Deployment bot: publish the approved default

Target **Moments Gallery**, `/home/enn707/moments-server-live`, serving `moments.inmomentservices.com/signage`. This is not the Moments Live service on port 3021. Fetch the server-only branch and install these two static assets; no service restart or database changes are required. Publish the video before the manifest:

```bash
cd /home/enn707/moments-server-live
set -e
git fetch origin codex/moments-live-server
asset=kwca-portrait-48c24462ca5f0b23.mp4
mkdir -p public/assets/signage
git show "FETCH_HEAD:public/assets/signage/$asset" > "public/assets/signage/$asset.tmp"
echo "48c24462ca5f0b239c910cbb4810281a466e16eeff2393878067ab1cb8559b90  public/assets/signage/$asset.tmp" | sha256sum -c -
mv "public/assets/signage/$asset.tmp" "public/assets/signage/$asset"
git show FETCH_HEAD:public/assets/signage/manifest.json > public/assets/signage/manifest.json.tmp
mv public/assets/signage/manifest.json.tmp public/assets/signage/manifest.json
curl --fail https://moments.inmomentservices.com/assets/signage/manifest.json
```

On an already-open player choose **Check for update**. The old cached loop continues until the new video finishes downloading; the player then replaces it and caches the approved loop. Refreshing the player also checks the latest manifest.

Registration `/play` crossfades four reviewed Custom Backdrops outputs: two couple and two three-person shots. Its 720x480 JPEG samples are about 81–85 KiB each. Pause and reduced-motion preferences are supported. Prepare from the reviewed local source folders with `node moments-server/scripts/update-curtain-samples.cjs`.

Browser checks: `node moments-server/scripts/test-game-samples.cjs` and `node moments-server/scripts/test-signage.cjs`. Set `PLAYWRIGHT_MODULE` if needed; Chrome must be available.
