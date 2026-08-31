# Onboarding art

Prompts for making Haunt's onboarding graphics with an image model, and how the
results get into the app.

## What we're after

A **rubber-stamp field note**: a warm off-white page with one small hand-carved
stamp on it, pressed in two or three desaturated inks that sit a hair out of
register, with dry gaps where the pad ran short. The stamp keeps only what you
would recognise a place by — a ridge, a tower, a stand of trees — and nothing
else. Quiet, handmade, collected rather than designed.

It works for Haunt because the app is nearly black. A warm paper card on that
ground reads as a physical object someone kept, which is what a haunt is.

The style is borrowed from [@Hamburgerai's travel field-note
posters](https://x.com/Hamburgerai/status/2090683415104557406) — the idea, not
the images. We make our own.

## Ask for the page without the words

Image models misspell. They will also bake the text into pixels at one size, in
one language, for one place.

**Generate the paper and the stamp only.** The app typesets the caption over it
in `--font-mono`, which means it is crisp at every density, and the same artwork
can carry any haunt's name, number, tags and year — including ones that do not
exist yet. There is a variant below that includes the text, for when you want a
single finished poster to look at.

## The prompt

Paste **STYLE** once, then **SUBJECT** for the image you want. In a chat-based
model (Gemini, ChatGPT) keep the thread and say "same paper, same inks, new
subject" for each following one — that is what keeps the set consistent.

### STYLE

```
A single square image of one page from a traveller's field notebook, photographed
flat from directly above, filling the whole frame.

The page is warm off-white paper, the colour of aged cartridge paper. Visible
paper fibre, fine natural grain, a matte uncoated surface, faint handling marks,
one or two barely-there foxing specks. Even, soft, diffuse daylight with no
visible shadow, no highlight, no vignette. The paper is the whole background —
no desk, no table, no props, no hands, no tape, no torn edges.

Printed low and slightly left of centre on the page is ONE small rubber stamp
impression. It occupies about 34% of the page height and no more than 55% of the
width, with generous untouched paper around it and clearly more empty paper below
it than above. Empty paper is the point of the composition.

The stamp is hand-carved lino or rubber, pressed by hand onto the page in 2-3
separate spot inks — one colour at a time, so the layers are misregistered by
about one millimetre in different directions. Every impression shows: carving
marks, uneven gouged line weight, notched and broken outlines, dry patches where
the pad ran short, paper showing through the ink, grainy pigment, uneven
pressure, a faint ghost of a doubled press at one edge. Ink sits ON the fibre —
absorbed, not glossy.

Inks are desaturated and mixed for a small press: charcoal grey, deep muted
green, brick red, ochre, grey blue, warm taupe. Use two of them plus at most one
small accent. Never bright, never fully saturated.

The stamp is reduced to the least information that still identifies the place.
Delete crowds, vehicles, rows of windows, repeated buildings, fussy foliage,
ornament and background. It must read as something carved and pressed, not as an
illustration, a logo, a woodcut print, a line drawing, or a photo with a filter.

No text, no letters, no numbers, no caption, no signature, no border, no frame.
```

### SUBJECT — one per onboarding step

Each line replaces the last paragraph of STYLE. The captions are what the app
prints over the image; they are here so the carving matches the words.

| File | Subject to carve | Caption the app prints |
| --- | --- | --- |
| `step-1-coast` | A headland dropping into water: the ridge line, a few stepped roofs along the slope, the shoreline, and three or four broken horizontal water lines. Grey blue and taupe, one small brick-red roof. | `DUMAGUETE · No. 01 · salt / dusk / quiet · 2026` |
| `step-2-passed` | The same headland, stamped **twice**: one clear impression, and a second fainter impression offset up and to the right by about 4mm, as if the same stamp were pressed again for someone else. Same inks, the second press noticeably drier. | `PASSED ON · No. 02 · one friend / then another` |
| `step-3-blank` | An empty carved rectangle — the frame of a stamp with nothing cut into it yet, just the pressed border and a bare paper interior. Charcoal only, one dry corner. | `——— · No. 03 · your name goes here` |
| `step-4-threshold` | A narrow gap between two blocks of building with steps leading into it, seen straight on. Charcoal mass, one ochre accent where light falls in the gap. | `THE EDGE · No. 04 · near / then inside` |
| `step-5-two` | Two small stamps side by side on the same page, different subjects: a stand of trees, and a low bridge. Deep green and charcoal, unequal pressure between them. | `TWO PLACES · No. 05 · kept / given` |
| `step-6-grove` | A stand of two trees with a low ground line under them and no horizon. Deep muted green canopy, charcoal trunks, nothing else. | `@you · No. 06 · the map remembers` |

### Variant: the finished poster, text included

For a single hero image where the typography is part of the picture, append to
STYLE:

```
Below the stamp, in the empty paper, four short lines of small typewriter text,
left aligned, in a restrained monospace with slight mechanical unevenness and
faint ink misfires:

VENICE
No. 01
brick / bell / lagoon
2026

Keep the type small — the place name no taller than 2% of the image height.
Spell every word exactly as written. No other text anywhere.
```

Swap those four lines for whatever the image is of. Expect two or three attempts
before the spelling comes out clean.

### Avoid list

Append if the model keeps reaching for the wrong thing:

```
Avoid: circular seals, red ink seals, postage stamps, perforated edges, wax
seals, stickers, collage, scrapbook layouts, travel souvenir templates, smooth
vector logos, generic city icons, dense over-carving, cartoon or children's
craft style, 3D rendering, plastic sheen, digital gradients, drop shadows,
saturated colour, borders, frames, mockup photography, desks, hands, plants,
coffee cups, watermarks.
```

## Output spec

- **Square, 1:1.** The onboarding steps stack art above text on a phone; a square
  card holds its own without pushing the copy off screen.
- **1024×1024 is plenty**, 1536 if the model offers it free. Ship at 2× the slot.
- Save as **WebP, quality ~82** (`cwebp -q 82 in.png -o out.webp`). Around
  120-200KB each; six of those is a fine cost for the whole intro.
- Names as in the table: `step-1-coast.webp`. Drop them in `public/onboarding/`.
- If a generation comes back with a hard edge or a background beyond the paper,
  crop to the paper before saving — the app expects the paper to bleed to all
  four sides.

## Wiring, once they exist

Tell me they are in `public/onboarding/` and I will:

1. Add a `FieldNote` card that lays the image on the dark ground with a hair of
   rotation and a soft drop shadow, so it reads as paper resting there.
2. Typeset the caption over the lower paper in `--font-mono` at the sizes above,
   from props rather than pixels.
3. Use it for the two decorative onboarding steps first, then the rest.
4. Preload step 1 so the cold open never shows an empty slot.

Alt text stays empty (`alt=""`) — these are decoration, and the step's own
heading already says what it means.

## When code is the right answer instead

Generated images are fixed. They cannot carry a haunt's own name, its three vibe
tags, or its number, so they cannot be a **keepsake** — which is exactly the
field note this app should be minting every time someone logs a visit.

For that, the stamp has to be drawn in the app from the haunt's data, with the
carving picked from its seed so a place is always stamped the same way. That is
what `src/components/FieldNote.tsx` is: SVG-filter texture — noise-displaced
edges, a dry-ink mask, ink grain, per-colour misregistration — over hand-authored
motifs. It will never have the richness of a generated raster, but it is 4KB, it
takes live data, and it themes.

The honest division: **generated art for the six fixed onboarding screens,
drawn-in-app stamps for anything that names a real place.**
