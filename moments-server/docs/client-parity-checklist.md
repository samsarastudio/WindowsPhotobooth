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
| Advanced sorting and filters | Admin supports common search/status/sort controls. The full combination of date ranges, expiry filters and every ascending/descending Pixieset ordering is not reproduced. |
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
node --test test/client-gallery.test.mjs
```

At the 24 November 2026 implementation check, **23 integration tests passed**.
The suite uses temporary databases, synthetic images and mock email delivery.
It checks real API responses and file bytes, not only UI presence. See
`client-testing.md` for the remaining mobile, performance and deployment checklist.
