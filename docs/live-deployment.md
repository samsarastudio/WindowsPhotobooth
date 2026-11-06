# Moments Live — manual deployment

## What is delivered

An independent Express/SQLite service in the Moments package, listening on **3021**.
The current Moments Gallery continues on **3020**. Live uses its own database and photo
directory; it does not migrate or expose the existing booth galleries.

- Admin-only owner creation/invitation by email; one-time 30-minute sign-in links.
- Optional SMTP delivery and email sign-in requests for existing invited owners.
- Owner dashboard, multiple events, cover images, photo filters, captions and transparent PNG overlays.
- Per-event guest capacity, per-guest lifetime shot allowance, publication/closure, reveal time and privacy.
- Shareable unguessable event links, downloadable QR PNGs and printable invitations.
- iOS/Android browser guest capture and camera-roll uploads without installation.
- Native iOS application + App Clip sources and native Android application.
- Authorized galleries, host moderation/favorites/deletion, individual downloads and ZIP export.
- Host live slideshow and a downloadable 6×9-inch photobook PDF of approved photos.
- AASA and Android Digital Asset Links endpoints configured with your real signing identities.

No payments, subscriptions, printing/shipping fulfillment, NFC hardware sales, or 24/7 staffed support are connected. The photobook is a printable PDF, not an order placed with a printing company. Screen branding supports covers, photo styles, graphic overlays and captions; there is no freeform sticker/layout editor. UI is English. Native apps handle the guest journey; owners manage events in the web studio.

## Deploy the server-only branch

Use **codex/moments-live-server** for a package-at-root checkout. The implementation
branch **codex/moments-live-events** is the complete monorepo; its package is `moments-server/`.
Do not switch the existing production checkout to this branch.

On the Pi, install Node **22 LTS** and build tools compatible with better-sqlite3.
For a 64-bit Raspberry Pi OS installation:

```bash
sudo useradd --system --home /var/lib/moments-live --shell /usr/sbin/nologin moments-live
sudo git clone --single-branch -b codex/moments-live-server \
  https://github.com/samsarastudio/WindowsPhotobooth.git /opt/moments-live
cd /opt/moments-live
sudo npm ci --omit=dev
sudo cp .env.live.example /etc/moments-live.env
sudo chmod 600 /etc/moments-live.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
sudo nano /etc/moments-live.env
# Paste the generated value into LIVE_ADMIN_KEY; configure SMTP if available.
sudo cp systemd/moments-live.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now moments-live
curl --fail http://127.0.0.1:3021/api/health
```

Adjust `ExecStart` if Node is installed somewhere other than `/usr/bin/node`.
`StateDirectory` creates `/var/lib/moments-live` owned by the service user.
Keep the administrator key and SMTP credentials in the protected environment file.

## Domain and HTTPS

In your existing Cloudflare Tunnel configuration, add a public hostname:

| Public hostname | Origin service |
| --- | --- |
| `live.inmomentservices.com` | `http://127.0.0.1:3021` |

For locally managed tunnels, merge `cloudflared.live.example.yml` into the existing
ingress list **before** the final `http_status:404`, and create the DNS tunnel route:

```bash
cloudflared tunnel route dns YOUR_TUNNEL_NAME live.inmomentservices.com
sudo systemctl restart cloudflared
```

For dashboard-managed tunnels, add the hostname in Cloudflare's tunnel UI instead.
Leave existing hostname mappings in place. Bypass caching for `/api/*`, including
images, because visibility can change. Do not put interactive Cloudflare Access login
in front of guest routes or `/.well-known/*`. The origin is bound to loopback.

Verify `https://live.inmomentservices.com/api/health`, then open `/admin` and create
your first owner invitation. Owners open the one-time link, create an event, set
its status to **published**, and share its `/e/<slug>` URL or QR.

SMTP is optional for initial setup: `/admin` always returns a copyable invitation.
Once SMTP is configured, invitations are mailed and existing owners can request
fresh links from the homepage. Configure SPF/DKIM/DMARC with your email provider.

## Updates, backups and rollback

```bash
cd /opt/moments-live
sudo git pull --ff-only
sudo npm ci --omit=dev
sudo systemctl restart moments-live
sudo journalctl -u moments-live -n 50 --no-pager
```

Back up `/var/lib/moments-live` and `/etc/moments-live.env`. Stop only `moments-live`
while taking a filesystem snapshot so SQLite, its WAL, and images remain consistent.
Record the deployed Git SHA before an update. Roll back code to that SHA only after
checking whether new schema migrations need their matching database backup.

Photos have no automatic expiry. Monitor disk capacity and backups; indefinite access
depends on operating the service. Deletion removes the gallery row and file. Previously
downloaded copies cannot be revoked. Guest identity is a per-device secret; clearing
browser storage or changing devices creates another guest, so shot limits are per
device admission, not verified identity. Invite links and event links should be shared
only with intended recipients. Guests do not receive owner access.

Browser and native galleries refresh periodically (8–15 seconds). Uploads require
internet; there is no offline upload queue. Uploads are limited to 15 MB / 40 MP and
normalized to JPEG up to 2400 px with EXIF removed. HEIC support depends on the
server's libvips build; native iOS converts captures/selections to JPEG.

## Local validation

```bash
npm ci
npm run test:live
npm run test:live:browser
```

Browser QA uses Playwright/Chrome. Set `PLAYWRIGHT_MODULE` to your installed Playwright
module if outside this workstation. Tests use temporary databases and never call production.
Android/iOS build and manual signing steps are in [mobile-release.md](mobile-release.md).

## Refreshing the server-only branch

After committing the monorepo implementation, derive a **new** subtree commit and
push it normally; do not force-push the existing `moments-server` production branch:

```bash
git subtree split --prefix=moments-server -b codex/moments-live-server
git push -u origin codex/moments-live-server
```

For subsequent refreshes, split to a temporary branch and fast-forward the deployment
branch when its history matches. Review divergence rather than overwriting it.
