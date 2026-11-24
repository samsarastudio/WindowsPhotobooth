# In Moment Client Gallery — manual deployment

This is a separate Node service for **https://client.inmomentservices.com**.
It listens on **127.0.0.1:3022**, uses its own database/media directory, and does
not replace Moments Gallery (3020) or Moments Live (3021).

The deployment branch is **codex/client-gallery** in
`https://github.com/samsarastudio/WindowsPhotobooth.git`. This is a full-repository
checkout: the Node package is inside `moments-server/`, not at the checkout root.
Use a new checkout at `/opt/moments-client`.

## Prerequisites

- A 64-bit Raspberry Pi OS/Linux installation with Node 22 LTS and npm.
- Build tools required by `better-sqlite3` if a matching prebuilt binary is unavailable.
- Port 3022 available on loopback.
- An authenticated Cloudflare Tunnel configured separately by the operator.
- SMTP credentials if you want gallery emails sent from the application.

Check before installation:

```bash
node --version
npm --version
command -v node
sudo ss -ltnp | grep ':3022' || true
sudo systemctl is-active moments-gallery moments-live
```

The supplied service uses `/usr/bin/node`. Adjust `ExecStart` if `command -v node`
reports another system-wide installation. Do not use a user's home-directory
Node installation with the hardened service's `ProtectHome=true` setting.

## First installation

Run on the Pi after the branch has been pushed:

```bash
sudo useradd --system --home /var/lib/moments-client --shell /usr/sbin/nologin moments-client
sudo git clone --single-branch --branch codex/client-gallery \
  https://github.com/samsarastudio/WindowsPhotobooth.git /opt/moments-client
cd /opt/moments-client/moments-server
sudo npm ci --omit=dev
sudo install -m 600 .env.client.example /etc/moments-client.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
sudo nano /etc/moments-client.env
```

Set `CLIENT_ADMIN_PASSWORD` to a unique password of at least 12 characters and
`CLIENT_SESSION_SECRET` to the generated value (at least 32 characters). Keep
`CLIENT_PUBLIC_URL=https://client.inmomentservices.com` and
`CLIENT_SECURE_COOKIES=true` for the public deployment. Do not commit the filled
environment file. Leave SMTP fields unset until your provider is ready.

```bash
cd /opt/moments-client/moments-server
sudo install -m 644 systemd/moments-client.service /etc/systemd/system/moments-client.service
sudo systemctl daemon-reload
sudo systemctl enable --now moments-client
```

`StateDirectory` creates `/var/lib/moments-client` with the correct service owner.
The application stores its own state there. Do not point it to either existing
Moments data directory.

## Wait for readiness

Service restart completion does not mean the HTTP listener is ready. Use this
bounded retry instead of treating the first failed probe as a deployment failure:

```bash
ready=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:3022/api/health; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  sudo systemctl status moments-client --no-pager
  sudo journalctl -u moments-client -n 100 --no-pager
  exit 1
fi
sudo systemctl is-active moments-client moments-gallery moments-live
```

## New Cloudflare Tunnel hostname

In the Cloudflare Tunnel's public-hostname configuration, add:

| Setting | Value |
| --- | --- |
| Public hostname | `client.inmomentservices.com` |
| Service type | HTTP |
| Origin service | `127.0.0.1:3022` |

For a locally managed tunnel, the corresponding ingress rule is:

```yaml
- hostname: client.inmomentservices.com
  service: http://127.0.0.1:3022
```

Place it before the final catch-all rule and preserve the existing hostnames.
Keep the origin bound to loopback. Cloudflare terminates public HTTPS; the
browser still receives secure cookies. Do not add a cache-everything rule for
this hostname: protected galleries, media and API responses must retain their
application cache policy. Cloudflare's upload limits still apply to each request;
use small upload batches for larger photo collections.

Verify through the public hostname after the tunnel is running:

```bash
curl --fail --silent --show-error https://client.inmomentservices.com/api/health
curl --fail --head https://client.inmomentservices.com/admin
```

Open **https://client.inmomentservices.com/admin**, sign in using
`CLIENT_ADMIN_PASSWORD`, configure branding, then create a test collection before
using the service for a real client. The public homepage is `/`; gallery links
use `/g/<collection-slug>`.

## Updating from Git

The new checkout must remain on the deployment branch with no local source
changes. Runtime configuration belongs in `/etc/moments-client.env`, and runtime
data belongs in `/var/lib/moments-client`.

```bash
cd /opt/moments-client
sudo git status --short --branch
sudo git pull --ff-only origin codex/client-gallery
cd moments-server
sudo npm ci --omit=dev
sudo install -m 644 systemd/moments-client.service /etc/systemd/system/moments-client.service
sudo systemctl daemon-reload
sudo systemctl restart moments-client
```

Then run the readiness loop above and check the public health URL. If Git reports
local changes or divergent history, inspect those changes rather than resetting
the production checkout. Updating this service does not require restarting
Moments Gallery or Moments Live.

## Backup and rollback

Back up the entire independent state directory, including the database, originals
and derived files. A brief stop produces a consistent filesystem backup:

```bash
sudo systemctl stop moments-client
sudo tar -C /var/lib -czf "/var/backups/moments-client-$(date +%Y%m%d-%H%M%S).tar.gz" moments-client
sudo systemctl start moments-client
```

Keep an additional protected backup of `/etc/moments-client.env`. Retain the
pre-update commit SHA (`git rev-parse HEAD`) and state backup for rollback. Never
restore an older application against a newer database schema without checking
migration compatibility; restore the matching backup if necessary.

## Deployment acceptance

- Health passes both on loopback and through the new hostname.
- Admin sign-in persists over HTTPS and logout invalidates access.
- One portrait and one landscape image upload and display correctly.
- Published gallery link works in a signed-out browser.
- Draft, hidden, expired and password-protected collections do not expose photos.
- Single-image and gallery downloads succeed with configured restrictions.
- Favorites and notes persist for the guest session.
- SMTP sharing sends only when intentionally requested and configured.
- Existing Gallery and Live health checks remain green.

See `client-parity-checklist.md` for the implementation's exact coverage and
remaining differences from the Pixieset research reference. A new service and
new tunnel must be deployed manually; a Git push alone does not publish the site.
