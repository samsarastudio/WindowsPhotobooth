# KIA PhotoBooth — Operator Slides

> Slide-style documentation. Each `---` block = one slide.  
> Use with `scripts/generate-photobooth-docs-pptx.py` or present directly from this file.

---

## Slide 1 — Title

**KIA PhotoBooth**

*Movement that inspires*

Full-screen Windows kiosk · QR scan → timed photo → frame → upload to KIA hub gallery

---

## Slide 2 — Main guest flow

**End-to-end journey — one QR = one session**

```
┌─────────────────────────────────────────────────────────────────┐
│  BEFORE BOOTH                                                   │
│  Guest registers at KIA hub / event app → gets QR on phone      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ 1 · SCAN │ → │2·CAPTURE │ → │ 3·RESULT │ → │ 4·UPLOAD │ → │ 5 · HOME │
│    /     │   │ /capture │   │ /result  │   │  queue   │   │    /     │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
 Scan QR       Countdown       Pick frame      Sync to       Ready for
 at booth      auto photo      tap ✓ save      gallery       next guest
```

| Step | Route | Guest does | Booth does |
|------|-------|------------|------------|
| **1 · Scan** | `/` | Hold QR to scanner (or tap area if camera fallback on) | Validates token → checkmark → auto-advance |
| **2 · Capture** | `/capture` | Pose & hold still | Camera live preview → timer video → auto shutter |
| **3 · Result** | `/result` | Optional frame → tap green ✓ | Preview photo + frame overlays |
| **4 · Upload** | `/result` | Wait briefly | Queues upload (works offline) → success message |
| **5 · Home** | `/` | Tap Continue or wait | Clears session → idle scan screen |

**Tip:** Guest finds their photo in the **KIA hub photogallery** after upload.

---

## Slide 3 — Admin first (operator priority)

**Admin is your control centre — hidden from guests on purpose**

Use Admin for:

- Event-day setup (scanner, camera, API)
- Fixing upload failures (queue refresh & retry)
- Editing on-screen text and logo
- End-of-event **system shutdown**

Guests never see Admin unless an operator reveals it.

---

## Slide 4 — How to access Admin

**Step-by-step — from the QR scan screen**

| Step | Action |
|------|--------|
| **1** | Booth must be on the **QR scan screen** (`/`) — the idle home screen |
| **2** | **Triple-tap** the **top-left corner** quickly (3 taps within 2.5 seconds) |
| **3** | **Admin** link appears bottom-left (visible for **5 minutes** by default) |
| **4** | Tap **Admin** → login screen (`/admin/login`) |
| **5** | Tap PIN field → on-screen numpad → enter PIN → **Sign in** |
| **6** | Dashboard opens at `/admin` |

**After sign out:** Admin link hides. Triple-tap top-left again to reveal.

**PIN hint:** Tap **ⓘ** on the login screen to see the shipped default PIN.

---

## Slide 5 — Default PINs & test codes

**Shipped defaults — check config if changed**

| Code / PIN | Default value | Purpose |
|------------|---------------|---------|
| **Admin PIN** | `2727` | Operator login to dashboard |
| **Bypass test code** | `12345` | Skip real guest QR during booth setup |
| **Dev bypass email** | `nandu@tuna.group` | Email used when bypass code is scanned |

**Where to change Admin PIN**

- File: `photobooth-app/config/photobooth-config.json`
- Key: `"adminPin"`
- Requires app **Reload** in Admin (or restart) if edited on disk

**Security notes**

- Do not share Admin PIN with guests
- Change PIN before production events if needed
- Bypass code is for **testing only** — disable or change for live events

---

## Slide 6 — What you can change in Admin

**Dashboard tabs — what each section controls**

### Top bar (always visible)

| Button | What it does |
|--------|--------------|
| **Reload** | Re-read config from disk |
| **Sign out** | Lock admin; hide Admin link |
| **Booth** | Return to guest screen |

---

### Tab 1 — Copy

**All guest-facing text**

| Section | You can change |
|---------|----------------|
| Scan landing | Tagline, title, subtitle, scan prompts, error messages, Admin link label & visible duration |
| Capture | “Starting camera…”, “Get Ready”, subtitle, footer hint |
| Result & upload | Keepsake title, upload/success messages, Continue button, min upload screen time, auto-home timer |

**Also on this tab:** Pending photo uploads (see Slide 8)

**Save:** **Save copy**

---

### Tab 2 — Logo

**Branding on QR, capture, and result screens**

| Action | Details |
|--------|---------|
| Choose logo image | PNG, JPG, SVG, or WebP |
| Logo size slider | 50% – 200% |
| Use default KIA logo | Removes custom upload |
| Live preview | See result before saving |

**Save:** **Save logo size** (after slider) · logo file saves on pick

---

### Tab 3 — Scanner & API

**Hardware + backend**

| Area | You can change |
|------|----------------|
| Booth camera | Orientation: Portrait (default) or Landscape |
| GFS4400 scanner | Enable/disable, COM port, baud rate (9600), test port, refresh ports |
| Camera QR fallback | Use booth webcam to read QR when serial scanner unavailable |
| KIA Forum API | Base URL, upload URL, bearer token, bypass email, QR prefix, bypass code |
| Offline mode | Allow prefix-format tokens when API unreachable |
| Debug | Show API debug log panel (bottom-right on guest screens) |
| Upload format | PNG (transparent edges) or JPEG (white background) |

**Two save buttons — use the right one:**

- **Save scanner & camera settings**
- **Save API settings**

**Test buttons:** Refresh ports · Test open port · Test API connection · Refresh queue

---

## Slide 7 — Shutdown procedure

**End of event — power off the booth PC safely**

### When to use

- Event finished
- Booth being packed down
- No more guests expected

### Steps

| Step | Action |
|------|--------|
| **1** | Triple-tap top-left on QR screen → tap **Admin** |
| **2** | Enter Admin PIN → **Sign in** |
| **3** | On login screen, tap red **Shutdown system** button |
| **4** | Read confirmation dialog |
| **5** | Confirm shutdown |
| **6** | App closes and PC runs `shutdown /s /t 0` (immediate power off) |

### Important

- **Do not** use Shutdown during active guest flow — wait for booth to return to home screen
- Shutdown is only available from **Admin login** (not the dashboard)
- Requires the **Electron desktop app** — not available in browser-only dev mode
- If shutdown fails, use Windows Start menu → Shut down, or hold power button as last resort

### Alternative exit (troubleshooting only)

- **Alt + F4** — closes app only; PC stays on
- Use when booth is frozen; not the normal end-of-event procedure

---

## Slide 8 — Upload queue — refresh & retry

**Offline-safe uploads — how the queue works**

### What happens when a guest taps ✓

1. Photo + selected frame are **queued immediately** on disk
2. Guest sees “Uploading…” then success — **booth does not wait for network**
3. Electron background process uploads when API is online
4. Failed uploads stay in queue for retry

**Queue file:** `sync-data/upload-queue.json` (beside the installed app)

---

### When to use Refresh & Retry (operator)

| Situation | Action |
|-----------|--------|
| Network was down during event | Open Admin → **Copy** tab → **Retry all** |
| Guest photo missing from gallery | Check queue → **Refresh** → **Retry all** |
| Upload error on guest screen | Fix API in Admin → **Retry all** |
| After changing API URL / token | **Save API settings** → **Retry all** |

---

### Where to find queue controls

**Copy tab — Pending photo uploads** (primary)

| Button | What it does |
|--------|--------------|
| **Refresh** | Reload queue list and pending count from disk |
| **Retry all** | Re-process every pending/failed item (disabled if queue empty) |

**Scanner & API tab** (secondary)

| Button | What it does |
|--------|--------------|
| **Refresh queue** | Updates pending count only |

---

### What each queue item shows

- Guest email
- Image filename
- Status: **Pending** or **Error**
- Attempt count
- Queued time & last retry time
- Last error message (if failed)

---

### Queue troubleshooting flow

```
Upload failed or photo missing from gallery?
        ↓
1. Admin → Scanner & API → Test API connection
        ↓
2. Fix URL / network if needed → Save API settings
        ↓
3. Admin → Copy tab → Refresh
        ↓
4. Retry all
        ↓
5. Confirm photo in KIA hub gallery
```

---

## Slide 9 — Guest screen 1: QR Scan

**Route:** `/` · Idle / waiting screen

**Guest sees:** Logo · tagline · “Capture Your KIA Moment” · animated QR area · status line

| Guest action | Method |
|--------------|--------|
| Scan QR | GFS4400 USB scanner (default) |
| Scan via camera | Tap QR area (if fallback enabled in Admin) |
| Manual entry | USB keyboard + **Enter** (testing) |

| Status | Default message |
|--------|-----------------|
| Idle | “Scan your QR code to get started” |
| Scanning | “Scanning…” |
| Checking | “Verifying…” |
| Success | “QR verified” + checkmark → Capture in ~1 s |
| Error | “Invalid QR code…” — try again |

---

## Slide 10 — Guest screen 2: Capture

**Route:** `/capture` · Opens automatically after QR success

**Guest sees:** “Get Ready” · live preview · countdown timer video · “Look at camera and hold still.”

| Guest | Booth (automatic) |
|-------|-------------------|
| Pose & hold still | Canon EDSDK or webcam fallback |
| No button to press | Timer video ~6–7 s → auto shutter |
| | Portrait mode: 90° rotate + 4:5 crop |
| | → navigates to Result |

---

## Slide 11 — Guest screen 3: Result & upload

**Route:** `/result`

**Guest sees:** Photo preview · frame row · green ✓ button

| Step | Guest | Booth |
|------|-------|-------|
| 1 | Tap frame (optional) | Overlay preview; locked frames show 🔒 |
| 2 | Tap green ✓ | Queue upload → “Uploading…” (min 3 s) |
| 3 | Read success message | “Upload completed successfully” |
| 4 | Continue or wait | Auto-home in 10 s → back to Scan |

**Frames:** “No effect” = plain photo · Unlocked = selectable · Locked = premium, disabled

---

## Slide 12 — Event-day setup checklist

**Run once before doors open**

| # | Task | Where in Admin |
|---|------|----------------|
| 1 | Triple-tap → Admin → sign in | QR screen |
| 2 | Refresh ports → select COM port | Scanner & API |
| 3 | Test open port | Scanner & API |
| 4 | Test API connection | Scanner & API |
| 5 | Save scanner & API settings | Scanner & API |
| 6 | Scan test QR (or bypass `12345`) | Booth screen |
| 7 | Full test photo end-to-end | Booth screen |
| 8 | Confirm photo in KIA hub gallery | Web / hub |
| 9 | Check upload queue = 0 pending | Copy tab → Refresh |

---

## Slide 13 — Operator cheat sheet

**Guest stuck?**

| Problem | Fix |
|---------|-----|
| Stuck on QR | Rescan; check scanner USB |
| Invalid QR | Guest needs registration QR from KIA hub |
| Camera black | DSLR USB + power; Admin → Reload |
| Upload error | Guest taps ✓ again; Admin → Retry all |
| Booth frozen | Alt+F4 or restart PC |
| End of event | Admin login → **Shutdown system** |

**Key defaults**

| Item | Value |
|------|-------|
| Admin PIN | `2727` |
| Bypass code | `12345` |
| QR prefix | `KIA-PHOTO-` |
| Scanner baud | `9600` |
| Admin link visible | `300` s after triple-tap |
| Auto home | `10` s after upload |
| Config file | `config/photobooth-config.json` |

---

## Slide 14 — App routes reference

| Route | Screen | Who |
|-------|--------|-----|
| `/` | QR scan (home) | Guest |
| `/capture` | Camera & countdown | Guest |
| `/result` | Preview, frames, upload | Guest |
| `/admin/login` | PIN entry + shutdown | Operator |
| `/admin` | Dashboard (Copy, Logo, Scanner & API) | Operator |

---

## Slide 15 — Questions?

**KIA PhotoBooth — Movement that inspires**

- Docs: `docs/FEATURES.md`
- Config: `photobooth-app/config/photobooth-config.json`
- PPT generator: `scripts/generate-photobooth-docs-pptx.py`

---

*Each section above maps 1:1 to a presentation slide. Priority slides for operators: **2** (main flow), **4–8** (admin, PINs, shutdown, queue).*
