# Christmas rebuild — 1.2.0

Branch: `codex/christmas-reskin`. Based on the fetched latest Halloween release,
`cb818f6` / `codex/moments-game-chances` (1.1.64), not the older `halloween` branch.

The booth, companion gallery, tablet, registration/game screens, preview page,
frame editor, print overlays, and 60-second signage campaign now use Christmas
presentation. The theme is `christmas` (MerryBooth, evergreen, ivory and gold).
Legacy scene/character filenames, API routes and settings keys remain compatible.

## Preserved feature baseline

Classic capture and retake; scene background choice; seven AI portrait choices;
guest crop/zoom/drag review; original/framed/AI uploads; QR sharing and downloads;
postcard and unframed magnet-sheet printing; printer recovery; server portrait
queue, deduplication and retry; tablet progress/handoff; game registration,
scoring, free retries, QR admission, paid photo offers, redemption and reporting;
offline signage caching; frame editor; OTA backups and operator configuration.

## Artwork inventory

Exactly **10 scene choices**, **24 unique plates**, **seven portrait templates**
and **eight guest print frames**. Scene previews duplicate medium plates as in
the previous release. The optional legacy DJ library remains available.

| Stable scene ID | Christmas scene | Plates |
| --- | --- | --- |
| pumpkin-patch | Santa’s Workshop | close / medium / wide |
| moonlit-manor | Elf Village | close / medium / wide |
| haunted-crypt | Santa’s Sleigh | close / medium / wide |
| graveyard | Northern Lights | close / medium / wide |
| evil-dead-cabin | Fireside Lodge | close / medium / wide |
| manor-gates | Winter Palace | close / medium / wide |
| zombie-gates | Gingerbread Cottage | close / medium / wide |
| haunted-harvest-carnival | Christmas Carousel | standalone |
| witch-lantern-garden | Starlight Garden | standalone |
| vampire-candlelit-ballroom | Christmas Ballroom | standalone |

The three character scenes put realistic, optically blurred Santa/elf/reindeer
characters behind the guest plane. Decor forms a physical architectural frame
within the photograph. Closer plates remove the wide foreground floor area.
Portrait choices are Father Christmas, Christmas Elf, Nutcracker, Winter King,
Christmas Conductor, Snow Queen and Christmas Belle. Head alignment metadata was
recomputed from each new template. The public portrait sample is explicitly
labeled a character template, not a claimed likeness-transfer result.

All raster scenes and characters were made with the **built-in image_gen tool**.
Final prompts, generation source paths and installed asset paths are recorded in
`photobooth-app/themes/christmas/artwork-prompts.json` and
`photobooth-app/themes/christmas/portrait-prompts.json`. Assets live in the
existing `config/ai-backgrounds/scene` and `config/compositions` directories.
Editable vector print-frame sources live in `themes/christmas/artwork`.

## Framing correction

Previously `prepareScene` chose a depth plate before the automatic subject crop,
then cropped the finished composite. That could keep a wide plate for a now-close
guest and cut away the decorative frame. It now segments once, safely crops the
guest first, transforms detected face sizes to the final crop, chooses the plate,
and composites into the intact background. Guest-approved `_crop` sources are
not automatically reframed. A proposed crop is rejected if it excludes a detected
face. The prepared alpha is reused rather than rerunning segmentation.

The existing thresholds remain: largest face height / image height >= 30% means
close, >= 16% means medium, otherwise wide. Smaller children do not pull a mixed
group into a wider category. With no detected face, wide remains the fallback;
silhouette framing still works. This estimates framing, not physical camera height.
Depth sets retain checksum validation, safe paths and whole-set removal.

## Validation

- Seven deterministic crop/depth scenarios, including adult/child groups,
  masked subjects, guest-approved crops, and a low child changing depth after crop.
- Real segmentation/compositing on the bundled single-person and family fixtures
  across all three character scenes: six outputs, zero changed protected opaque
  subject pixels. Single selected close; four-person family selected medium.
- Asset checks: 10 choices, seven valid depth sets, 24 correctly sized plates,
  no detected foreground-sized faces in scene sets, seven detected portrait heads,
  and eight transparent print overlays.
- Existing eight browser guest-flow cases, updated to current frame-preview and
  unframed-magnet contracts; desktop/tablet screen review with headings and Back
  controls kept visible above scrollable choice grids.
- 56 existing server tests plus a Christmas stock-title migration test passed;
  game/event, portrait queue/retry, tablet photo state and physical-layout coverage;
  upload JPEG, portrait-output preservation, background removal and OTA checks.
- Production Angular build. Existing admin SCSS exceeds its warning budget by
  238 bytes; compilation succeeds.
- Christmas signage encoded and decoded as a 1080×1920, 60-second, 30fps MP4.
- Five mobile companion screens checked against a real server with isolated test
  data; no browser exceptions. The stock game title migrates once to Jingle Hoops,
  preserving prices, scoring rules and custom event names.

Review artifacts: `output/christmas/ui`, `output/christmas/qa/overview.png`,
`output/christmas/scenes-review.png`, `output/christmas/portraits-review.png`.
These local QA outputs are intentionally outside tracked source.

Physical Canon capture/printing, paid live portrait generation and production
deployment are not certified by these local checks. No production service or
operator data was changed. Existing custom branding and operational credentials
remain operator-owned; the OTA migration only renames the stock HauntBooth name.

Rebuild with `npm run electron:build:folder` in `photobooth-app`. The resulting
folder and OTA zip are staged under the repository's `builds` directory.

Validated Windows folder: `builds/PhotoBooth-Folder-1.2.0-20261101-233045`.
Matching OTA ZIP: `builds/PhotoBooth-Folder-1.2.0-20261101-233045.zip`.
