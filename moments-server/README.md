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
