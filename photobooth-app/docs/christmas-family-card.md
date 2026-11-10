# Christmas family card

Available as **Family Christmas Card** in the Christmas experience menu.

Capture one person, review the background-removed portrait, then add it or retake. **Take another** repeats the capture; **Finish card** exports a burgundy Christmas card with evergreen portrait windows. Guests can remove portraits, add an optional family greeting (60 characters), and edit the completed card. The next session starts empty.

The local BiRefNet model removes backgrounds in an isolated utility process. Guest faces are not generated or repainted. The existing Halloween scene placement logic is unchanged. Only the finished card enters the normal gallery/share workflow; individual cutouts are not submitted by this feature.

The export is 1800 × 2400 JPEG. The normal portrait print path preserves card edges with contain fitting; paper of a different aspect ratio may have margins. No physical printer was available for this change.

## Layouts

| Portrait count | Portraits per row |
| --- | --- |
| 1 | 1 |
| 2 | 1, 1 |
| 3 | 2, 1 |
| 4 | 2, 2 |
| 5 | 3, 2 |
| 6 | 3, 3 |
| 7 | 3, 2, 2 |
| 8 | 3, 3, 2 |
| 9 | 3, 3, 3 |
| 10 | 4, 3, 3 |

Every row is centered. Tile size scales with row and column count. Zero, fractional, and greater-than-ten counts are rejected.

## Verification

- `node scripts/test-family-card.cjs`: actual background removal on two approved solo fixtures, reused across ten count examples; verifies cutout alignment, layout bounds, row centering, no overlaps, and output dimensions. Outputs `output/christmas/family-card-tests/all-counts.jpg`, ten full-size cards, and `report.json`.
- `node scripts/qa-family-card-flow.cjs --packaged`: prerecorded webcam through the real Electron camera/IPC/removal flow; covers retake, approval, take another, remove, finish, edit, and session reset. Printing and uploading are disabled in this isolated test.
- `npm run build`: production Angular compilation.

Sample fixtures are for layout verification, not a claim that ten different family members were photographed. Physical camera, printer, and live gallery delivery for this new mode need an on-site acceptance check.
