# Client Gallery — implementation coverage

This checklist compares the service with the **81 feature groups** in
`deliverables/pixieset-client-gallery-reference-2026-11-24/feature-inventory.json`.
It is not a claim that every Pixieset feature or every paid integration is
reproduced. “Implemented” means a working application path exists; physical-phone,
real-provider email and public-tunnel verification remain deployment checks.

The new application uses an original In Moment interface and layout treatments.
Pixieset screenshots and client photos are research references only and are not
bundled into the public service.

## Core delivery paths implemented

| Area | Implemented behavior | Verification |
| --- | --- | --- |
| Administration | Separate password sign-in, persistent sessions, logout, foreign-Origin rejection, rate limiting, protected admin API | API integration tests |
| Collections | Draft/published/hidden/pre-release states, create/edit, slug, date, description, tags, star, duplicate, trash and restore; 30-day trash purge and orphan-file maintenance | API lifecycle and shared-file retention tests; admin interface |
| Media | Multi-file photo upload, original-byte retention, rotated JPEG previews, sets, captions, private flags, ordering, replace, move/copy and authorized original download | Mixed orientation, EXIF, original-byte, replacement and isolation tests |
| Video | MP4/WebM storage/playback and allowlisted YouTube/Vimeo embeds | Embed restrictions tested; real video playback is a manual check |
| Gallery | Photographic cover, focal point, mixed portrait/landscape grid, lightbox, slideshow, sharing and mobile layout | Browser review plus deployment-device checks |
| Privacy | Collection/homepage passwords, private photos/sets, client-access password, registration, expiry and visibility enforced on media URLs | Access, media and password-revocation tests |
| Downloads | Single/multiple/all images, original and 3600/2048/1024/640 sizes, PIN, email recording, allowed emails/sets, global or per-email count limit, independent gallery/selected/video availability, expiring links and ZIP files | Original bytes, proportional resize, ZIP entries, per-email limits and access-policy tests |
| Proofing | Multiple named favorite lists, notes, completion status, preset selection limits, browser session persistence and emailed recovery link | Isolation, limit and single-use recovery-token tests |
| Branding | Studio name, logos, image assets, text/image watermark definitions, selected preview watermarks and optional watermarks on resized downloads | Actual pixel changes, opacity-zero and unchanged-original tests |
| Reuse | Collection design/settings presets and delivery-email templates | Application CRUD paths; operator smoke check |
| Homepage | Enable/disable, title/intro, category browsing, collection listing, independent password and visible-collection controls | Homepage password and disabled-state tests |
| Sharing | Copy gallery URL, SMTP delivery to chosen recipients, multiple collections with separate recipient mappings, activity after successful send | Mock SMTP, mapped-link and HTML-escaping tests; real SMTP remains a deployment check |
| Marketing | Campaign drafts, explicit subscriber records, send-once campaign behavior, signed unsubscribe flow | Subscription/campaign/unsubscribe tests |
| Bulk setup | CSV collection import using the transactional bulk-create API; folder imports map child folders into draft collections with per-file progress and stop-after-current-file control | Atomic rollback and successful multiple creation tests |
| Pre-release | Signup-only landing state, explicit subscription consent, published-gallery campaign notifications | No-photo pre-release and consent tests |
| Expiry reminders | Optional reminder within three days of expiry, once per recipient/expiry date, through configured SMTP | Maintenance deduplication tests with mock SMTP |

## Reference differences and remaining work

These distinctions are material when evaluating “everything in Client Gallery.”
Do not describe the application as complete Pixieset parity while these remain.

| Reference capability | Current scope / difference |
| --- | --- |
| Natural-language photo-library search | Filename/caption text search is implemented. Semantic image search and face/object indexing are not. |
| Collection folders and volume workflow | Collections, sets, CSV creation and folder-upload mapping are supported. Folder import retains completed files when stopped or interrupted; it is not atomic across multiple uploads. Photographing QR cards to match people to collections is not implemented. |
| Advanced sorting and filters | Photo ordering now supports multi-select drag/drop, touch/keyboard placement buttons, filename/upload/capture-date ascending and descending, random, balanced orientation and one-step undo. Capture dates read EXIF from retained originals, missing dates sort last. Collection-level date-range and expiry filters remain incomplete. |
| Quick-share photo links | Expiring single-photo quick-share links can be created from photo options. A full link-management dashboard with individual revocation controls is not implemented. |
| Download control granularity | Full-gallery, selected-photo and video controls and per-email limits are implemented. PIN and size policy remain shared; separate single-photo PIN/size policies are not reproduced. |
| Download generation email | Exports stream through a short-lived download URL. A queued background ZIP job with file-ready email is not implemented. |
| Bulk delivery presentation | Mapped bulk collection sharing is implemented. The full folder-based volume-management workspace is not reproduced. |
| Expiry reminder editing | Automatic reminders are implemented. The full rich-text expiry-reminder template editor is not reproduced. |
| RAW | RAW editing/conversion and RAW-specific delivery are not implemented. Supported decoded image formats are listed by the uploader. |
| Localization | The interface is English. A complete translated gallery language catalog is not implemented. |
| Rich email/layout editor | Reusable subject/message templates are available. The full rich-text branded email builder and live email-layout preview are not reproduced. |
| Exact design-template parity | Cover/style choices are In Moment CSS designs inspired by the reference. They do not reproduce Pixieset's proprietary artwork, type assets or exact rendering. |
| Detailed camera metadata | Width, height, filename and caption are available. Full EXIF/camera/lens/location inspection is not implemented. |
| Commerce, CRM and editor bridges | Store checkout/price sheets, Studio Manager contacts, Photo Editor and Lightroom plugin integrations are separate products and are not connected. |
| Analytics provider | Built-in activity is available. Google Analytics provider setup, cookie consent for optional analytics and external reporting are not connected. |
| Custom domains per photographer | Deployment uses `client.inmomentservices.com` through the operator's tunnel. Automated per-customer domain verification and certificate provisioning are not included. |

## Operational boundaries

- This deployment is one studio/administrator service, not a multi-tenant SaaS
  billing or user-seat platform.
- SMTP is optional configuration. The app returns a clear error when asked to
  send without a configured transport; tests use a local mock, not real recipients.
- Favorite recovery requires access to the emailed single-use token. Merely typing
  someone else's email does not expose their selection history.
- Videos are stored and delivered as uploaded; no transcoding or adaptive bitrate
  service is installed. Browser codec compatibility and video size require testing.
- Original image bytes are retained. Derived previews and resized JPEG downloads
  are separate from the originals.
- Existing Moments Gallery and Live services, URLs and QR direct-download flows
  are separate and are not modified by installing Client Gallery.
- Public production behavior cannot be verified until the new hostname/tunnel
  and service have been deployed by the operator.

## Automated verification

From `moments-server/`:

```bash
node --test test/client-gallery.test.mjs test/client-capture-date.test.mjs test/client-photo-delivery.test.mjs
```

At the 24 November 2026 implementation check, **29 tests passed**.
The suite uses temporary databases, synthetic images and mock email delivery.
It checks real API responses and file bytes, not only UI presence. See
`client-testing.md` for the remaining mobile, performance and deployment checklist.

## 24 November 2026: publishing, sharing and ordering audit

Documentation scope: Pixieset Client Gallery (the originally selected product),
not its Website, Store, Studio Manager or Photo Editor products. Reviewed the
89-article documentation index and the linked guides for sharing, sorting,
design, privacy, unpublishing, downloads, favorites, folders, photo search and QR
matching. This is not a claim to have implemented all 89 articles.

Sources:
- https://website-help.pixieset.com/en/collections/2362726-client-gallery
- https://help.pixieset.com/hc/en-us/articles/115003479351-Sharing-a-collection-with-your-client
- https://website-help.pixieset.com/en/articles/4064115-sorting-photos-in-a-collection
- https://website-help.pixieset.com/en/articles/4064136-hiding-unpublishing-a-collection
- https://website-help.pixieset.com/en/articles/4064067-privacy-options-for-client-gallery
- https://website-help.pixieset.com/en/articles/4064075-collection-download-settings
- https://website-help.pixieset.com/en/articles/4064071-using-favorite-lists-for-client-proofing
- https://website-help.pixieset.com/en/articles/10012577-using-folders-to-share-and-organize-galleries
- https://website-help.pixieset.com/en/articles/13863027-searching-your-collection-photos
- https://website-help.pixieset.com/en/articles/18182511-matching-photos-to-collections-with-qr-codes

Added in this update:
1. Draft/hidden/expired collections offer Publish instead of an actionable sharing URL.
2. Explicit publish confirmation; no automatic emails when publishing.
3. Public draft/hidden/expired URLs return HTTP 404; admin draft preview remains available.
4. Active published pages render Open Graph title, description, URL and cover image on the server, before JavaScript executes; Twitter image metadata is included.
5. Social cover JPEG is 1200 × 630, proportionally contained to preserve the whole picture.
6. Draft, hidden, expired, password-protected, registration-protected, private-photo and private-set images cannot be fetched as public social previews. Homepage hiding remains separate from direct-link availability.
7. Social preview image URL follows the selected cover; messaging apps can retain previously cached previews outside our control.
8. Published collections offer downloadable 1000px QR PNGs in Share.
9. Multi-select photo ordering; desktop drag/drop; touch/keyboard Move to start/end and Place before controls.
10. Filename A–Z/Z–A, upload oldest/newest, capture oldest/newest, random and optional balanced-orientation sorts.
11. Capture date uses EXIF DateTimeOriginal/DateTimeDigitized from original files; no fabricated capture dates. Missing dates are placed last, or the order is unchanged if none exist. Camera clock values are compared as recorded (no inferred timezone correction).
12. One-step order undo, atomic writes, cross-collection validation and stale-order conflict checks.
13. Ordering changes preserve original images; set-scoped sorts preserve other sets' positions.

Verification: 25 API integration tests, one EXIF test and three file-sharing tests
pass. Browser checks covered draft link hiding, filename sort, undo, selected-group
movement and generated QR display. Native desktop drag and physical-device touch
should also receive operator acceptance testing. No production publishing or email
sending was performed during verification.

Still outstanding beyond this update (not represented as complete parity):
- Shared collection folders, global folder passwords, volume QR photo matching.
- Semantic/object photo search, detailed camera/lens metadata filters.
- Scheduled email invites, full rich email designer, background ZIP-ready emails.
- Full multi-recipient favorite-list sharing/copy/download workflow parity.
- Separate single-photo PIN, email and size policies.
- Full collection bulk-edit/date-range/expiry filtering workspace.
- RAW handling, translated interface catalog, slideshow music/customization parity.
- Quick-share link management/revocation dashboard and multi-photo quick shares.
- Lightroom/Capture One, Studio Manager, Store and Photo Editor integrations.
- Google Analytics integration and per-photographer domain provisioning.
- Exact proprietary template assets and all Pixieset account/billing/storage tooling.

For cover previews and QR URLs on the deployed host, CLIENT_PUBLIC_URL must match
that host exactly. The user's current public host is
https://clients.inmomentservices.com (plural); the original deployment example
used client.inmomentservices.com (singular). Set the environment value to the
hostname actually configured in Cloudflare. Do not overwrite the session secret,
password or data directory when updating.
