# Moments Live — manual deployment

## What is delivered

An independent Express/SQLite service in the Moments package, listening on **3021**.
The current Moments Gallery continues on **3020**. Live uses its own database and photo
directory; it does not migrate or expose the existing booth galleries.

- Admin-only owner creation/invitation by email; one-time 30-minute sign-in links.
- Optional SMTP delivery and email sign-in requests for existing invited owners.
- Owner dashboard, multiple events, cover images, natural-colour photos, captions and transparent PNG overlays.
- Per-event guest capacity, per-guest lifetime shot allowance, publication/closure, reveal time and privacy.
- Shareable unguessable event links, downloadable QR PNGs and printable invitations.
- iOS/Android browser guest capture and camera-roll uploads without installation.
- Native iOS application + App Clip sources and native Android application.
- Authorized galleries, host moderation/favorites/deletion, individual downloads and ZIP export.
- Host live slideshow and a downloadable 6×9-inch photobook PDF of approved photos.
- AASA and Android Digital Asset Links endpoints configured with your real signing identities.

No payments, subscriptions, printing/shipping fulfillment, NFC hardware sales, or 24/7 staffed support are connected. The photobook is a printable PDF, not an order placed with a printing company. Screen branding supports covers, graphic overlays and captions; there is no freeform sticker/layout editor. UI is English. Native apps handle the guest journey; owners manage events in the web studio.

## Existing host: moments-server-live on port 3020

The reported host has `/home/enn707/moments-server-live`, managed by
`moments-gallery.service` on port 3020. That is the existing Gallery installation,
not an installed Moments Live service. Its detached HEAD and local `.env`,
`node_modules`, and lockfile do not need changing to install Live alongside it.

Do **not** run the update commands below until Live has been installed. Do not
switch/reset/stash the existing Gallery checkout or replace its service entrypoint.
Live uses `src/live/index.js`, `.env.live` (or a systemd environment file), and
`LIVE_PORT`; the old Gallery's `.env` and `PORT` are not Live configuration.

Read-only checks on the host (inspect locally; environment files may contain secrets):

```bash
sudo systemctl status moments-gallery --no-pager
sudo systemctl cat moments-gallery
git -C /home/enn707/moments-server-live status --short --branch
sudo ss -ltnp | grep -E ':(3020|3021)\b'
command -v node
node --version
```

Then follow **First installation** below. Those steps create `/opt/moments-live`
and `moments-live.service`; neither is expected to exist beforehand. The new clone
has its own lockfile and dependencies. The existing checkout, local files, service,
and port 3020 remain untouched. Check that port 3021 is available before starting.
Only the new `live.inmomentservices.com` hostname should point to port 3021;
preserve all existing Gallery hostname routes.

After installation, verify both services are active:

```bash
sudo systemctl is-active moments-gallery moments-live
curl --fail http://127.0.0.1:3021/api/health
# Expected: service "moments-live", version 2.
```

If instead you intend to retire Gallery and reuse its checkout, service name and
port 3020, this is a replacement deployment requiring a migration/rollback plan;
do not apply the parallel-install commands as an in-place conversion.

## First installation: deploy the server-only branch

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

Verify `https://live.inmomentservices.com/api/health`, then open `/admin`, set up your
administrator login as described below, and create your first owner invitation. Owners open the one-time link, create an event, set
its status to **published**, and share its `/e/<slug>` URL or QR.

SMTP is optional for initial setup: `/admin` always returns a copyable invitation.
Once SMTP is configured, invitations are mailed and existing owners can request
fresh links from the homepage. Configure SPF/DKIM/DMARC with your email provider.

## Administrator login and dashboard

On the first visit to `/admin`, enter the existing `LIVE_ADMIN_KEY` once, your admin
email address, and a password of at least 12 characters. This creates one service-wide
administrator account. No SMTP is required for admin login. Subsequent visits use
email and password, with a seven-day HttpOnly session cookie (Secure under HTTPS).
Passwords are stored as salted scrypt hashes; session tokens are stored as hashes.
The administrator account and sessions survive service restarts.

The dashboard lets you:

- Create/invite owners and generate fresh one-time owner sign-in links.
- List owners, edit their names/emails, and suspend or restore owner access.
- Select an active owner and create a published event link or a draft directly.
- Copy guest links, download QR codes, and open any event's studio for settings,
  moderation, photo management and deletion.
- Manage feature switches and change the administrator password.

Suspending an owner invalidates their sessions and pending invitations; existing
events, guest access and photos remain intact. Close or unpublish an event separately
if guest participation should stop. Changing an owner's email also revokes their
existing sessions/invitations. Restoring access requires issuing a fresh invitation.
Admin-created published events default to 25 photos per guest, 250 guests and
immediate reveal to joined guests; use the studio to change these before sharing.

For forgotten passwords, use **Forgot your password?** on `/admin` and supply the
server key to set new admin credentials. Password changes and recovery invalidate
all previous admin sessions. Keep `LIVE_ADMIN_KEY` configured and private: it remains
a recovery credential and supports existing authenticated admin API integrations.
There is no public administrator registration or email password-reset endpoint.

For an existing installation, pull the deployment branch and restart Live as below.
Startup adds the administrator/session tables and owner access flag automatically;
existing owners and events are preserved. Open `/admin` to complete the one-time setup.

## Share a live mosaic wall

In **Admin → Events**, expand **Mosaic wall link** on an event and select
**Enable wall link**, then **Copy wall link**. The same controls are in the event
studio. Share this separate `/wall/<random-token>` link with a viewer or open it on
a display; no owner/admin sign-in is required. Use **Fullscreen** for a display.
The wall lays out multiple photo tiles, refreshes every five seconds, and cycles
through the newest 200 approved photos when more photos exist than fit on screen.

Sharing is off by default for each event. The event must be published or closed,
with guest visibility set to **Everyone's approved photos**. Future reveal times
are honored. Draft, host-only and own-photo galleries are unavailable through wall
links, including direct image URLs. Anyone holding an enabled wall link can see its
eligible photos; share it only with the intended audience.

**Disable wall** stops access. **Replace link** invalidates the old link. The global
**Shared mosaic walls** switch disables every wall independently of the guest Web app
switch. Wall settings survive server restarts; deleting an event removes its link.
Existing open walls clear unavailable photos on the next successful refresh (normally
within five seconds), and clear the display on connection errors. Saved copies cannot
be recalled. Cloudflare caching must remain bypassed for `/api/*`, including `/api/wall/*`.

### Remove inappropriate photos

Choose **Review photos** from the admin event card, or open the event studio:

- **Hide from guests** immediately blocks a photo's guest/wall image URLs and
  removes it from public feeds. Administrators and the owner can still review it.
- **Delete → Delete photo** permanently removes the photo from the album and storage.
- Under **Privacy, timing & limits**, enable **Approve new photos before guests see
  them** to screen future uploads. Use **Awaiting approval** to review pending photos.

These are manual moderation tools, not an automatic NSFW classifier. Turning on
approval affects future uploads; review already-approved photos separately.

## Administrator feature switches

Sign in at `https://live.inmomentservices.com/admin`, expand **Feature controls**,
and change the switches
and select **Save feature settings**. All switches default to on and are stored
in the Live SQLite database. No restart is needed to change them.

| Switch | Effect when off |
| --- | --- |
| Web app | Guest and owner browser pages return 503. `/admin`, signed-in administrator studio access, native APIs and association files remain available. |
| Guest participation | Rejects new guest admissions and uploads across web, iOS, App Clip and Android. |
| Scheduled closing editor | Owners cannot change upload deadlines; existing deadlines still apply. |
| Scheduled reveal editor | Owners cannot change reveal times; existing hidden photos remain hidden. |
| Host-only gallery option | Owners cannot newly select host-only visibility; existing private galleries remain private. |
| Countdown and reveal experience | Hides countdowns and the gallery-opening announcement; timing rules still apply. |
| Covers and branding | Hides covers and disables branding uploads/new photo overlays. |
| Live slideshow | Blocks the slideshow page and feed. |
| Shared mosaic walls | Blocks public wall pages, feeds and image access. |
| Download controls and ZIP export | Blocks explicit image-download requests and ZIP export. |
| Photobook PDFs | Blocks PDF generation. |

New uploads always use natural camera colour, without warm or black-and-white filters.
The legacy filter flag is held off even if an older client tries to enable it.
Existing photo pixels are unchanged by this update or branding switches. Download controls
are not DRM: anyone authorized to see an image can still save or screenshot it.
The Web app switch controls browser pages, not API client identity. To stop all
new guest uploads, also turn off Guest participation. If you disable the web app,
return directly to `/admin` to enable it again. Administrator sign-in remains required.
API enforcement is immediate; open clients refresh controls periodically.

Owners set **Camera closes at** and the reveal time in their browser's local
timezone. The server stores absolute timestamps and enforces deadlines without
a scheduled job. Keep the server clock synchronized. A published event becomes
effectively closed at its deadline; its saved publication setting remains published.
To reopen it, extend/clear the deadline and ensure the saved status is published.
Visibility choices are everyone, each guest's own photos, or host only. A reveal
deadline never grants guests access to a host-only gallery.

This update adds `live_settings` and `events.closes_at` automatically on startup.
Existing events default to no closing deadline. Back up before updating as below;
do not delete or recreate the existing Live database. Rebuild mobile apps using
[mobile-release.md](mobile-release.md) to include the new controls/countdowns.

## Updating an existing installation

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
npm run test:live:camera
npm run test:live:wall
```

Browser QA uses Playwright/Chrome. Set `PLAYWRIGHT_MODULE` to your installed Playwright
module if outside this workstation. Tests use temporary databases and never call production.
Android/iOS build and manual signing steps are in [mobile-release.md](mobile-release.md).

Camera layout QA covers 16 viewport scenarios in Chromium and WebKit: compact
320×480 through 430×932 phones, landscape, reduced browser/keyboard viewports,
and simulated notch/home-indicator insets. It checks no page overflow, visible
44px minimum controls, modal bounds, camera shutdown, and capture/preview aspect
ratio in Chromium. Results and screenshots are written to
`output/camera-responsive/`. The suite needs Chrome and Playwright's WebKit browser
installed (`node PATH_TO_PLAYWRIGHT/cli.js install webkit`). `CAMERA_ENGINES` can be
set to `chromium` or `webkit` for an individual engine run.

These are desktop touch-viewport tests, not physical-device certification. Chromium
uses a synthetic canvas camera. The Windows WebKit build has no media stack, so its
preview is mocked and it exercises file uploads instead of camera capture. Real
iOS Safari and Android Chrome still need device checks for permission prompts,
front/back cameras, rotation, changing browser chrome, and returning from background.

## Refreshing the server-only branch

After committing the monorepo implementation, derive a **new** subtree commit and
push it normally; do not force-push the existing `moments-server` production branch:

```bash
git subtree split --prefix=moments-server -b codex/moments-live-server
git push -u origin codex/moments-live-server
```

For subsequent refreshes, split to a temporary branch and fast-forward the deployment
branch when its history matches. Review divergence rather than overwriting it.
