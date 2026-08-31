# Unwired components

Built, styled, and typechecked — but nothing in `src/screens` imports them yet.
They live here so the main `components/` folder only holds what actually renders,
without throwing away design work that a later flow will want.

Each one still compiles against the current domain model, so they stay honest as
the types change. When a flow adopts one, move it up a directory and delete its
row from this table.

| Component | What it does | What it needs to ship |
| --- | --- | --- |
| `DumaguetePickerMap.tsx` | Full Leaflet map for choosing a haunt's zone: drag, tap-to-place, pinch/wheel zoom, arrow-key nudging, live radius projection. | Drop a Haunt currently fixes the zone at `{ x: 44, y: 44 }` and shows a static tile. Wire this in to let people place it, then feed the result to `dropHaunt`. **It is also the last thing here still on Leaflet** — the live map moved to MapLibre and vector tiles, so wiring this up means porting it (`map.project` for `latLngToContainerPoint`, and its zoom is one step off MapLibre's) or the app ships two map engines. |
| `ImprintControls.tsx` | Picks a haunt's shroud temperament and lifespan (`lasting` / `single` / `dated`). | Both fields exist on `Haunt` and are honoured by `isHauntActive` and the shader, but Drop a Haunt hardcodes `lifespan: 'lasting'` and a seeded temperament. |
| `Residue.tsx` | Leaving and displaying visitor traces — a coloured mark placed in the haunt's field. | `Haunt.residues` is modelled and always empty. Needs a `leaveResidue` action on the data layer and a slot on Haunt Detail. |
| `SigilDraw.tsx` | Freehand sigil capture, normalized to 0–1 so it replays at any size. | `Haunt.sigilPath` and `Keepsake.sigilPath` are modelled. Intended for the keepsake a visit produces. |
| `PhysicalNote.tsx` | Paper-styled composer for the arrival note plus a private note for the recipient. | Superseded for now by `ArrivalNoteComposer`, which also records audio. Keep for the passing flow, which has no note styling of its own. |
| `FieldNote.tsx` | Draws a haunt as a stamped field-note page: hand-carved motif in 2-3 spot inks, noise-displaced edges, dry-ink mask, ink grain, per-colour misregistration, with a typewriter caption. Motif and jitter come from the haunt's seed, so a place is always stamped the same way. | The fixed screens use generated art from `public/art/` instead (see [docs/illustrations.md](../../../docs/illustrations.md)). This one exists for **keepsakes**, which have to carry a real name, tags, number and year — something a generated raster cannot. Needs a slot on the profile. |
| `HauntStepCounter.tsx` | Four-stage progress pip row (`tone → write → place → seal`). | From an earlier multi-step Drop a Haunt. The flow is one page now; restore this if it ever splits again. |

## Before wiring one up

- Confirm the fields it writes exist on the domain model in `src/domain/`.
- Add the corresponding action to the data layer rather than mutating state in
  the screen, so the Supabase adapter picks it up for free.
- `Residue` and `SigilDraw` both produce user content that needs a storage
  bucket and a row-level security policy; see `docs/supabase.md`.
