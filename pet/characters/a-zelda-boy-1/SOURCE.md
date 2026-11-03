# 红衫剑士 / a-zelda-boy-1 — source & provenance

## Source

- Page: <https://opengameart.org/content/zelda-like-tilesets-and-sprites>
- Author: **ArMM1998** (OpenGameArt)
- Pack: *Zelda-like tilesets and sprites* (16x16 tilesets, character with sword animation, character template, effects/objects/UI)
- Downloaded file: `gfx_3.zip` (174,776 bytes, zip integrity verified)
- Asset used: `gfx/character.png` — 272x256 RGBA, a grid of 16x32 walk cells (rows 0-3, all four directions) and 32x32 sword-attack cells (rows 4-7)

## License

**CC0 1.0 Universal (public domain dedication)** — <https://creativecommons.org/publicdomain/zero/1.0/>

The OpenGameArt entry lists License(s): **CC0**. CC0 places the work in the public domain,
so redistribution — including inside this plugin — is permitted and no attribution is required.
This file records the origin for transparency only.

## How the frames were extracted

Reproducible recipe (Python 3 + Pillow, nearest-neighbour, no resampling of pixels):

1. Unzip `gfx_3.zip` and open `gfx/character.png` (RGBA, already transparent).
2. Walk frames are cell-based: `character.png.crop((col*16, row*32, col*16+16, row*32+32))`.
   Attack frames are wider: `crop((col*32, row*32, col*32+32, row*32+32))`.
3. Every walk cell is pasted at `x = 8` onto a transparent 32x32 canvas (the attack cells are
   already 32x32). This makes **all** frames of this character 32x32, so the pet's
   bottom-centre draw keeps the feet on one ground line when states switch.
4. Frames saved as `idle_N.png` / `work_N.png` / `win_N.png` / `err_N.png`, untouched colours.

### Frame mapping (row/col in the original sheet, 0-based)

| state   | sheet cells        | what it is in the pack                    | fps |
| ------- | ------------------ | ----------------------------------------- | --- |
| idle    | row 0, cols 0-3    | 4-frame front-facing walk cycle           | 4   |
| working | row 4, cols 0-3    | 4-frame sword swing, facing viewer        | 8   |
| success | row 7, cols 0-3    | 4-frame sword swing, facing right         | 10  |
| error   | row 6, cols 0-3    | 4-frame sword swing, facing left          | 6   |

`thinking` / `streaming` / `sleep` / `disconnected` reuse the frames above (see `skin.json`) —
only the four documented animations exist in this pack, so no new pixels were invented.

## Size

All PNGs are 32x32 RGBA, total folder well under 300 KB.
