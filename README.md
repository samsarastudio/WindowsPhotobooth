# Moments Gallery Server

Live session galleries for InMoment photobooths. Guests open `https://moments.inmomentservices.com/{session}` to view photos as they arrive.

## Pi port note

This host already runs apps on **3000**, **3001**, and **5000**. Moments uses **`3020`** only.

| Service | Port |
|---------|------|
| Existing apps | 3000, 3001, 5000 |
| **Moments gallery** | **3020** |

Cloudflare Tunnel should map **`moments.inmomentservices.com` → `http://127.0.0.1:3020`** without changing apex `inmomentservices.com` routing.

## Gallery admin

Open `/admin`, unlock with `ADMIN_PIN`.

Sections: **Overview** · **Albums** · **Photos** · **QR events** · **Frames** · **Mosaic wall** · **Settings**

- **Add sample photos** seeds a demo album + placeholder frame for testing
- Delete whole albums or individual photos
- Frames list shows overlays currently on the server (booth syncs these)
- **QR events** — print A3/A4 card batches, activate, reset sessions, attendant page

## Gallery URLs

| URL | What guests see |
|-----|-----------------|
| `/{session}` | Photo grid for that day/session |
| `/{session}/wall` | Mosaic wall for that session |
| `/{session}/slideshow` | Auto slideshow for that session |
| `/wall` | Mosaic of **all** photos from active (non-expired) sessions |
| `/wall/slideshow` | Slideshow of all active-session photos |
| `/{session}/p/{photoId}` | Deep link / lightbox to one photo (+ optional **Link my card**) |
| `/q/{code}` | Event card preview (linked photo or “get your photo taken”) |
| `/qr-scan` | Attendant iPad/phone scanner (event name + live counts) |

## QR event cards

1. Admin → **QR events** → create batch (50/100/200/custom) → choose **A3 or A4** → Generate.
2. Download PDF, print, cut cards.
3. **Activate** the batch.
4. Attendants bookmark `/qr-scan` on an iPad/phone (camera in the page).
5. Guests keep cards; phone camera opens `/q/{code}` (inmoment branded preview + Instagram).
6. After a photo, guests can **Link my card** on the share page (optional).
7. **Reset session** reuses the same printed codes without reprinting.

Printed QR payload: `{PUBLIC_BASE_URL}/q/{code}`.

After deploy on the Pi: `npm install --omit=dev` (adds `qrcode` + `pdfkit`) then restart `moments-gallery`.

## Photo frames (booth overlays)

Manage PNGs in Moments Admin → **Photo frames**, or from the photobooth **Admin → Frames** with Sync / Publish / Delete on server.

- Public list: `GET /api/frames`
- Media: `/media/frames/{filename}`
- Upload/delete: upload token or admin PIN

## Git deploy on the Pi (backend-only branch)

The monorepo publishes a special branch **`moments-server`** whose *root* is only this package (no photobooth app). Use that branch on the Pi so `git pull` never fetches booth code.

### First-time clone

```bash
cd ~
git clone -b moments-server --single-branch \
  https://github.com/samsarastudio/WindowsPhotobooth.git moments-server
cd moments-server
cp .env.example .env
nano .env   # PORT=3020, UPLOAD_TOKEN, ADMIN_PIN, PUBLIC_BASE_URL
npm install --omit=dev
npm start   # or enable systemd unit below
```

### Update later

```bash
cd ~/moments-server
git pull
npm install --omit=dev
sudo systemctl restart moments-gallery
```

### Refresh the deploy branch from a developer machine

After changing `moments-server/` on `inmoment` (or `main`) and committing:

```bash
git subtree split --prefix=moments-server -b moments-server
git push origin moments-server --force-with-lease
```

(`--force-with-lease` is normal: subtree split rewrites that branch’s history.)

## Quick start

```bash
cd moments-server
cp .env.example .env
# edit UPLOAD_TOKEN, ADMIN_PIN, PUBLIC_BASE_URL
npm install
npm start
```

Health check: `http://127.0.0.1:3020/api/health`

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3020` | Listen port (avoid 3000/3001/5000) |
| `HOST` | `127.0.0.1` | Bind address |
| `PUBLIC_BASE_URL` | `https://moments.inmomentservices.com` | Used in share / QR URLs |
| `UPLOAD_TOKEN` | _(required)_ | Booth `Authorization: Bearer` token |
| `ADMIN_PIN` | `2727` | Gallery `/admin` PIN (`X-Admin-Pin`) |
| `DEFAULT_TTL_DAYS` | `30` | New session lifetime |
| `DATA_DIR` | `./data` | SQLite + photo files |

## URLs

- Gallery: `/{sessionSlug}` e.g. `/onam-2026-08-01`
- Photo deep link: `/{sessionSlug}/p/{photoId}`
- Admin: `/admin`
- API: `/api/sessions/...`, `/api/admin/...`

## systemd

Copy `systemd/moments-gallery.service` to `/etc/systemd/system/`, adjust paths/user, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now moments-gallery
sudo systemctl status moments-gallery
```

**Do not run systemd and PM2 at the same time.** Two process managers both restarting `node src/index.js` on port 3020 is an immediate `EADDRINUSE` crash loop.

### Stop an EADDRINUSE crash loop

```bash
# pick the supervisor you actually use, stop the other
sudo systemctl stop moments-gallery
pm2 stop moments 2>/dev/null || true

# release a stuck 3020 socket, then start only one supervisor
sudo fuser -k 3020/tcp || true
sleep 1
ss -ltnp | grep 3020 || echo "3020 is free"

sudo systemctl start moments-gallery
# or: pm2 start ecosystem.config.cjs
```

## Booth OTA packages (Pi)

Folder builds are ~150MB zips. **Cloudflare can reset or size-limit large single uploads**, so:

1. Deploy the Moments code that supports **chunked** admin upload (`git pull` on the Pi, restart `moments-gallery`).
2. Prefer Admin → **Booth updates** chunked upload via `https://moments.inmomentservices.com/admin`.
3. If the browser still stalls, register on the Pi itself (no Cloudflare, no browser TLS):

```bash
# From your Windows build PC
scp builds/PhotoBooth-Folder-1.1.0-YYYYMMDD-HHMMSS.zip pi@PI_HOST:~/moments-server/incoming/

# On the Pi
mkdir -p ~/moments-server/incoming
cd ~/moments-server
node scripts/register-booth-zip.mjs incoming/PhotoBooth-Folder-1.1.0-YYYYMMDD-HHMMSS.zip
# optional: add --rollout to activate immediately
sudo systemctl restart moments-gallery   # only if you just git-pulled code
```

Then open Admin → Booth updates → **Refresh** → **Roll out** (unless you used `--rollout`).

Booths install manually: Photobooth Admin → Gallery → **Install update**.

## Cloudflare Tunnel

Add an ingress rule (keep existing hostnames for 3000/3001/5000):

```yaml
ingress:
  - hostname: moments.inmomentservices.com
    service: http://127.0.0.1:3020
  # ...existing rules...
  - service: http_status:404
```

## Photobooth Admin

In PhotoBooth → **Admin → Gallery**:

1. Enable gallery upload
2. Set API base URL to `https://moments.inmomentservices.com`
3. Paste the **Upload token** from Moments `/admin` → **Settings** (Generate → Save → Copy), or from `UPLOAD_TOKEN` in `.env`
4. Set session prefix (e.g. `onam` → daily `onam-YYYY-MM-DD`)

Uploads: original, framed, and AI variants. Share QR on the result screen opens the photo deep link.

## Admin tasks

- Change default TTL for **new** sessions
- Extend / delete existing sessions
- Purge expired sessions (also runs automatically every 6 hours)


## Live game desk (Angular + server events)

The game desk uses AOT-compiled Angular 19 islands for player cards, the detail popup,
the live kiosk ribbon and reports. Signals hold snapshots, OnPush cards keep stable
player identities, and no Zone.js or runtime compiler is shipped. Host payment/PIN
forms remain outside the live regions so updates do not replace in-progress input.

`npm ci` and `npm run build:game-admin` rebuild `public/js/game-admin-angular.js` and
its license file. These generated assets are checked in: the Pi needs only
`npm ci --omit=dev` and a service restart after pulling the server changes.

Authenticated `GET /api/admin/game/events` streams change notifications via SSE.
The browser fetches a fresh authorized snapshot only after a change, on search,
on initial connection/reconnection, or when explicitly refreshed. Idle tabs do not
poll. Credentials remain in headers, never URLs. SSE reconnects with backoff and
closes on lock. Reverse proxies must allow streaming (buffering is disabled by the
response header); the stream sends a 15-second keepalive. The current systemd
single-process server uses in-process events; multiple replicas would require a
shared pub/sub transport before scaling out.

The updated Unity kiosk sends `/api/game/progress` with the reserved round/run IDs,
phase only. Status transitions send immediately, with a score-free heartbeat every 15 seconds. Final shot totals and score are sent only to `/api/game/result`. Heartbeats establish connection freshness; unchanged
heartbeats do not invalidate dashboard snapshots; a small SSE presence event refreshes only connection timestamps. Only the authenticated claim
consumes a chance, and only the durable result endpoint awards photos. Late/recovered
attempt telemetry cannot overwrite the current run. A connection older than 45 seconds
is labelled unconfirmed rather than represented as reliably live.

Player details include payment count/amount/time, credit-use time, game-start time,
last connection and result status/score. Game reports include payment totals, credits,
extensions, attempt completion/recovery, accuracy, scores and photo balances, plus a
CSV of the latest 200 attempts. Aggregate payment/reward totals include legacy data;
new lifecycle metrics are labelled tracked attempts because old kiosks did not send
start/heartbeat data. Times in the UI use the host browser timezone; stored times and
CSV timestamps are UTC ISO strings.

The new default is 10 shots, 10 points per made basket, 99 points for two photos (so
all 10 baskets qualify). A one-time migration updates the old 10-shot/60-point default
to 99; customized targets and already-purchased round rules are preserved. The kiosk
home copy reads the server rules, so deploy/restart Moments as well as updating the
Windows game. Existing paid extension and two-chance photo guarantees remain.


## Haunted Hoops admin update — 29 October 2026

Game desk → System now controls the main-game difficulty (Easy / Normal / Hard; default Normal) and the points target (default **666**, up to 90 × base shots). The idle game attract screen refreshes the target automatically. Running rounds retain their purchased rules. Graded scoring awards 90 / 70 / 60 / 50 for perfect / nice / bank / other baskets, 20 for a rim-out, 10 for a backboard miss and zero for other misses. Results include grade evidence, validated against shot count, basket count and total. Legacy round snapshots continue to accept their original ten-point scoring.

The player keeps one QR. Hosts can add a main chance, then one three-shot extension to an eligible one-photo round, then another main chance and its extension. The desk distinguishes main chances and extensions, automatically shows the QR after approval, and marks extensions ready. A home-screen scan always consumes a ready extension before full-game credits. Extensions have exactly three shots, no practice, temporarily use Easy and carry forward the stored base score. Completion guarantees the second photo. A round already at two photos cannot buy an extension.

The authenticated kiosk `POST /api/game/reset` handles F9. It restores an unfinished base credit once or re-enables the paid extension. It never refunds a finished result. Requests are scoped to the kiosk, round and run and are idempotent. Reset events appear in the player history. The client journals uncertain resets and blocks further admissions until they are confirmed.

Deployment: pull the **moments-server** branch on the Pi and restart `moments-gallery`, then replace the Unity player with the matching release. No new production dependencies are required. Schema migration is additive; default target 99 becomes 666 once, custom targets and prior round rules are preserved. The live server is not restarted by the development workstation.

Validation: `npm run test:game`, `npm run build:game-admin`, `npm run test:game:browser`, and the matching Unity QA player with `npm run test:game:unity`. All test grants/redemptions are confined to isolated databases.
