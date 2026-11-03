# 紫袍法师 / a-necromancer-2 — source & provenance

## Source

- Page: <https://opengameart.org/content/mr-necromancer-man-animated>
- Author: **Disthron** (OpenGameArt)
- Pack: *Mr. Necromancer Man [Animated]* — a purple-robed staff mage, made as a companion to
  the author's skeleton character.
- Downloaded file: `YeOldyNecroGuy.png` (3,351 bytes, RGBA sprite sheet, 164x134)
- The page's own Copyright/Attribution Notice reads: *"You don't have to credit me but if you do
  please credit Disthron"* — the entry itself is listed as CC0.

## License

**CC0 1.0 Universal (public domain dedication)** — <https://creativecommons.org/publicdomain/zero/1.0/>

The OpenGameArt entry lists License(s): **CC0**, so it is redistributable inside this plugin.
Attribution is optional; the author is credited anyway in `skin.json` and in this file.

## How the frames were extracted

The source sheet is hand-placed, so the cells are **not** on a perfectly regular grid.
Reproducible recipe (Python 3 + Pillow):

1. Open `YeOldyNecroGuy.png` (already transparent).
2. For each animation row, crop each sprite to its tight alpha bounding box. Row bands used:
   - idle row: `y 15..34`, columns `(21,35) (42,56) (63,77) (82,96)`
   - working row: `y 35..56`, columns `(21,36) (39,56) (60,76) (79,97) (100,120) (121,139)`
   - success row: `y 95..113`, columns `(19,34) (40,65) (70,94) (100,122)`
   - error row: `y 60..81`, column `(21,36)`
3. **Alignment:** each cropped frame is re-seated on one shared transparent canvas (38x21) with
   - its **bottom edge on the canvas bottom**, and
   - its **feet anchor** (the horizontal centre of the lowest 3 content rows) on the canvas centre.

   Anchoring on the feet instead of the bounding-box centre is what keeps the mage's body steady
   while the staff swings far left/right in the attack frames.
4. Frames saved as `idle_N.png` / `work_N.png` / `win_N.png` / `err_N.png`; colours untouched,
   no resampling (no scaling, no anti-aliasing).

### Frame mapping

| state   | source band                          | what it is in the pack              | fps |
| ------- | ------------------------------------ | ----------------------------------- | --- |
| idle    | row at y15-34, sprites 1-4           | 4-frame standing idle with staff    | 5   |
| working | row at y35-56, sprites 1-6           | 6-frame lean-forward casting cycle  | 10  |
| success | row at y95-113, sprites 1-4          | 4-frame overhead staff swing        | 10  |
| error   | row at y60-81, sprite 1              | single staff-raised pose            | 2   |

`thinking` / `streaming` / `sleep` / `disconnected` reuse the frames above (see `skin.json`).
The sheet also contains a separate white "spell puff" sprite and an extra pose; they are **not**
used, so every frame stays the same silhouette. No new pixels were invented.

## Size

All PNGs are 38x21 RGBA, total folder well under 300 KB.
