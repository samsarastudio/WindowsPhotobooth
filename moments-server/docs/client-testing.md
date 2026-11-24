# Client Gallery — release verification

Run checks against a new temporary data directory. Use generated test images,
not the private client photos in the Pixieset reference captures. Automated API
tests do not substitute for the mobile, email-provider and Cloudflare checks below.

## Isolation and authentication

1. A signed-out request cannot list or mutate collections, presets, settings,
   watermarks, activity records or guest email records.
2. A wrong admin password does not create a session. Repeated failures are rate
   limited. Successful cookies are HttpOnly, SameSite and Secure on production.
3. An authenticated mutation from an unrelated Origin is rejected.
4. Logout invalidates the session; copied expired or modified cookies fail.
5. Restarting the process preserves collections and media, but never resets an
   existing deployment to sample data.

## Gallery access and media

1. Publish a collection containing landscape, portrait and square photos. Confirm
   both thumbnails and full-size media render with the correct orientation.
2. Open its link in a separate signed-out browser. Confirm draft, hidden, trashed
   and expired collections are inaccessible, including copied media URLs.
3. Set a collection password, confirm wrong passwords fail, then unlock it. Confirm
   another browser remains locked. Removing/changing the password must invalidate
   inappropriate prior access.
4. Enable registration and check that the prompt is not repeated during the valid
   session. Email registration is distinct from marketing opt-in.
5. Confirm client-private photos cannot be reached through ordinary gallery,
   lightbox, direct-image or ZIP paths.
6. An invalid or unsupported upload fails clearly and leaves no public broken
   image. A file renamed to an image extension must not bypass decoding checks.
7. Names and captions containing HTML display as text rather than executing.

## Download and proofing

1. Original download matches original dimensions; each web/high-resolution option
   stays within the requested bounds without enlarging smaller originals.
2. Disable downloads and confirm both single-file and gallery exports are denied.
3. Test correct/incorrect PINs, allowed-contact restrictions, allowed sets, download
   limits and an empty gallery. Expired or hidden galleries must invalidate exports.
4. Check an export cannot include a guessed photo ID from another collection.
5. Open the downloaded ZIP and inspect filenames and actual image bytes. Duplicate
   filenames must not overwrite one another within the archive.
6. Create two independent guest favorite sessions, including the same typed email.
   One guest must not acquire another guest's private selections solely by typing
   that address. Verify notes, changes, completion and photographer activity.

## Admin workflow

1. Create, edit, tag, star, duplicate, trash and restore a collection; refresh and
   confirm persisted state after every action.
2. Upload a batch, move images between sets, reorder, rename, replace, set a cover
   and remove an image. Check original/thumbnail cleanup and selected cover fallback.
3. Save a preset and template, apply them, then edit/delete them. Existing collections
   should not unexpectedly change when a reusable preset is edited.
4. Save every design control; refresh the editor and public link. Verify supported
   cover, palette, typography and layout choices produce the intended visible change.
5. Check library search, date/status/tag filters, starred items and trash empty states.
6. Make the homepage private or disabled and verify collection privacy independently.

## Browser and deployment checks

- Widths: 320px, 390px, 430px, tablet, 1440px desktop. No horizontal page overflow.
- Physical Safari on iPhone and Chrome on Android: touch lightbox, back navigation,
  downloads, favorite dialogs, virtual keyboard, rotation and long titles.
- Keyboard: visible focus, dialog close, Escape, left/right image navigation and
  focus return. Screen-reader labels for icon-only actions.
- Performance: 500-image gallery, interrupted uploads and slow mobile connection.
  Images load incrementally and errors provide a usable retry path.
- Real SMTP: deliver one intentionally requested test share; verify subject,
  absolute HTTPS link, sender and activity status. Disabled SMTP reports failure
  honestly without claiming an email was sent.
- Cloudflare: public HTTPS sign-in, upload batch, secure-cookie persistence and ZIP
  download; no cached private responses. Health readiness uses bounded retries.
- Recheck Moments Gallery 3020 and Live 3021 after installing/updating Client 3022.

## Test result recording

Record commit SHA, date, command, pass/fail count and limitations. Never mark a
feature complete solely because its button appears or its settings JSON persists.
Use `client-parity-checklist.md` for reference-feature implementation status.
