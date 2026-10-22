# Halloween scene backgrounds

Three guest-facing scene choices:

- `pumpkin-patch.png`: warm physical Halloween set, based on the original app family demo and its background setting prompt.
- `moonlit-manor.png`: Enchanted Harvest Garden, a warm decorated conservatory. Stable internal filename retained for existing selections.
- `haunted-crypt.png`: Pumpkin Lantern Cottage, a cozy autumn cottage. Stable internal filename retained for existing selections.

The two sets were replaced at the user's request. Their current six built-in generation prompts and source paths are in `output/warm-halloween-replacements.json` at the repository root. Previous plates are backed up under `output/replaced-halloween-scenes/`. Older prompt files describe superseded designs. Display names come from the depth sidecars.

Before scene composition, wide input captures receive a tighter proportional 3:2 portrait crop to remove the lower leg/foot area. This is a conservative framing heuristic, not a shoe detector. All faces must fit safely; otherwise a waist-up retake is requested. Depth is selected again from the cropped framing. Pixel preservation comparisons use the normalized cropped input; cropping resamples pixels but never redraws faces or changes proportions.

Each main image previews the medium variant. Its matching `.depths.json` points to close, medium, and wide plates in `depths/`. The source prompt is in `moments-server/src/halloween/openai-edit.js` (`HALLOWEEN_SCENE_INPAINT`); the original family result is `moments-server/public/assets/halloween/samples/scene-ai.png`. That prompt specifies Halloween atmosphere and blending, not a detailed porch layout; the saved sample supplies the visual design. The old field plate is preserved under `output/background-depths/originals/`.

`electron/background-depth.cjs` estimates framing from the largest detected face height divided by capture height: close at 30% or above, medium at 16% or above, otherwise wide. This is a framing heuristic, not a physical depth measurement. It never switches the selected scene. Depth plates already have their intended focus treatment, so the app does not apply additional global blur. A custom replacement of the main image disables old variants via the base-image checksum.

All nine plates were generated with the built-in image tool. `depth-prompts.json` records the full prompts and provenance. Medium drafts with substantial floor visible were classified as wide after visual inspection. Fine-hair matting limitations are separate from background selection; guests are not passed to a generative editor.

Admin identifies sets and removes the main plate, depth sidecar and all three variants in one confirmed action. Removed files are kept under the runtime `.removed/` folder for recovery, outside the selectable scene list. Files are validated before moving; unrelated sets are untouched.

`scripts/qa-six-backgrounds.cjs` now exercises all nine plates with both generated fixtures (18 outputs). `scripts/test-background-set.cjs` checks set removal and path confinement.
