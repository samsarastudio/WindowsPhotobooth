# Christmas family card

Available as **Family Christmas Card** in the Christmas experience menu.

Capture one person, review the captured portrait, then add it or retake. **Take another** repeats the capture immediately while approved portraits process in the background; **Finish card** queues a burgundy Christmas card with a continuous evergreen grid with single shared foliage dividers. Guests can remove portraits, add an optional family greeting (60 characters), and edit the completed card. The next session starts empty.

The local BiRefNet model removes backgrounds in an isolated utility process. Guest faces are not generated or repainted. The existing Halloween scene placement logic is unchanged. The processing card preview and finished framed card enter the existing gallery workflow; individual cutouts are not submitted by this feature.

The export is 1800 × 2400 JPEG. The normal portrait print path preserves card edges with contain fitting; paper of a different aspect ratio may have margins. No physical printer was available for this change.

## Layouts

| Portrait count | Portraits per row |
| --- | --- |
| 1 | 1 |
| 2 | 1, 1 |
| 3 | 2, 1 |
| 4 | 2, 2 |
| 5 | 2, 2, 1 |
| 6 | 2, 2, 2 |
| 7 | 3, 2, 2 |
| 8 | 3, 3, 2 |
| 9 | 3, 3, 3 |
| 10 | 3, 3, 2, 2 |

Every row fills the same centered grid width, with no burgundy gaps or doubled frame edges. Portrait window widths adapt to the row count. Great Vibes is bundled with its OFL license for the script heading and family line. Zero, fractional, and greater-than-ten counts are rejected.

## Verification

- `node scripts/test-family-card.cjs`: actual background removal on ten distinct fictional sample people, including children and varied poses, across ten count examples; verifies cutout alignment, layout bounds, row centering, no overlaps, and output dimensions. Outputs `output/christmas/family-card-tests/all-counts.jpg`, ten full-size cards, and `report.json`.
- `node scripts/qa-family-card-flow.cjs --packaged`: prerecorded webcam through the real Electron camera/IPC/removal flow; covers retake, approval, take another, remove, finish, edit, and session reset. Printing and uploading are disabled in this isolated test.
- `npm run build`: production Angular compilation.

Sample people are generated fictional portraits for verification. Sources, cutouts and all ten cards are retained in `deliverables/christmas/family-card-samples`. The final samples contain no mugs. Physical camera, printer, and live gallery delivery for this new mode need an on-site acceptance check.


## Background queue (default)

The default checked background option keeps the capture flow available during removal. Finish creates a draft card and uploads it as an original with Processing status. The completed card uses the same capture-family stem with `_framed.jpg`, arriving as a Ready framed variant in the existing Moments admin/tablet gallery. Existing print, QR and download controls apply. No print job is sent automatically.

Each card snapshots its source paths and greeting. New families cannot change queued cards. Job records survive renderer reload; incomplete cards are resumed, and failed jobs have a Retry action in Card queue. The normal durable upload queue handles offline delivery. Individual portrait removal shares the existing scene worker queue to avoid concurrent heavy model allocations. Uncheck the background option to wait for and edit a card locally.

`node scripts/qa-family-card-queue.cjs --live` exercises two consecutive family sessions, nonblocking capture, live Processing-to-Ready gallery delivery and QR sharing. Physical printing remains untested without hardware.

The foliage border is 220 pixels thick at export size. Dense branch sections overlap every corner and junction by 90 pixels, with softened end caps. Layout verification samples every join to catch exposed dark gaps. Extra portrait headroom protects faces from the fuller foliage.
