# Haunt

A mobile social map where friends hand each other the places that matter to them.
A haunt is a real spot someone cared about enough to leave behind — its exact
location stays hidden inside a vague zone, and the note waiting there stays
sealed until you physically arrive. Places travel person to person, never through
a feed.

This repository is a clickable front-end prototype: every screen and flow is
real, and the data behind them comes from fixtures. It is built to have a backend
put underneath it, and [the seam for that](#swapping-the-backend) is already in
place along with a full Supabase schema.

## Running it

Node 22+ and pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:5173.

| Command | |
| --- | --- |
| `pnpm dev` | Dev server with hot reload |
| `pnpm build` | Typecheck and build to `dist/` |
| `pnpm preview` | Serve the built output |

Two things worth knowing while poking at it:

- **`?onboarding=1`** replays the intro without clearing anything else.
- **`window.haunt.reset()`** in the browser console wipes the prototype's data
  and reloads from the fixtures. Development only.

## What is where

```
src/
  domain/      the model, and the pure rules that go with it
  data/        the backend seam — mock and Supabase both live behind one interface
  context/     application state: a cache of the last snapshot, plus navigation
  screens/     one file per screen
  components/  shared UI, including the WebGL shroud shaders
    unwired/   built, styled, and not in any flow yet — see its README
  lib/         geo projection, seeded randomness, time formatting, id generation
supabase/
  migrations/  schema, row-level security, and the read and write functions
docs/
  architecture.md   how the layers fit together and why
  supabase.md       standing up the real backend, and what is still unverified
  deploy.md         Supabase + GitHub + Vercel, start to finish
```

The dependency rule is one-directional: screens know about `domain` and
`context`, `context` knows about `data`, and `data` knows about `domain`. Nothing
flows back up. A screen importing from `src/data` is a mistake.

## Swapping the backend

Everything that touches data goes through `HauntDataSource`
([src/data/dataSource.ts](src/data/dataSource.ts)). Two implementations exist:

- **`mock`** (default) — the whole dataset in memory, mirrored to local storage.
  It also holds the business rules, which makes it the specification for what
  each mutation means.
- **`supabase`** — Postgres with PostGIS zones and row-level security.

Switching is one environment variable:

```bash
cp .env.example .env.local
```

```
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

No screen changes. See [docs/supabase.md](docs/supabase.md) for the migrations
and — importantly — for what has not yet been run against a live database, and
[docs/deploy.md](docs/deploy.md) for getting it online.

### Accounts

Only the Supabase backend has them, and there is no email field anywhere.
Opening the app creates an anonymous account tied to the device. A **recovery
code** — sixteen characters, shown exactly once — is what carries that account to
another device.

Both halves of the credential are derived from the code by SHA-256, so nothing
stores the code or a hash of it. That is why it cannot be shown twice and why
nobody can look it up for someone who lost it. The mock backend skips all of
this: it is a single imaginary person.

### Making the mock backend behave like a real one

The mock answers instantly and never fails, which is not what a network does.
Two knobs make it honest, for checking that loading and error states hold up:

```
VITE_MOCK_LATENCY_MS=350
VITE_MOCK_FAILURE_RATE=0.15
```

## Design

Dark-first, and quiet on purpose: no emoji, no bright call-to-action colours, no
badges or counts competing for attention. Motion is slow — 280–420ms, ease-out —
because nothing here is urgent.

The palette is muted almost to the point of monochrome. The three state colours
are desaturated pastels rather than signal colours, so a map full of haunts still
reads as a map rather than a dashboard:

| Token | | |
| --- | --- | --- |
| `--color-bg` | `#000000` | The ground everything sits on |
| `--color-visited` | `#b7d2c6` | Pale sage — you have been here |
| `--color-unvisited` | `#c8c4ee` | Pale lavender — a friend's place, unvisited |
| `--color-fof` | `#dfbea4` | Pale tan — one hop out, still hidden |
| `--color-ink` / `-2` / `-3` | `#f7f7f8` / `#c8c8cc` / `#85858c` | Three levels of text |

Type is one family at two optical sizes: SF Pro Display for the wordmark and
screen titles (`--font-serif`, despite the name), SF Pro Text for everything else,
and SF Mono for handles and distances. All three fall back to the system stack.

Every token lives in the `@theme` block at the top of
[src/index.css](src/index.css). Nothing should hardcode a colour outside it.

## Where this is going

The prototype validates the feel. Production is React Native + Expo against the
Supabase schema in `supabase/migrations/`, with Mapbox in place of Leaflet.

The largest pieces still missing:

1. **Geofencing.** `visits.near_at` is what the "did you make it?" prompt reads,
   and nothing writes it. It needs a background location task, which is a native
   concern.
2. **Health decay.** A visit fogs a zone; quiet time is supposed to clear it.
   The dip is implemented, the recovery is not — it wants a scheduled job.
3. **Residues and sigils.** Modelled in both the schema and the domain, with the
   UI built and waiting in `src/components/unwired/`.
4. **A live run.** None of the SQL has executed against a real Postgres. The
   first deploy is a bring-up, not a release.

## Attribution

Map imagery is Esri World Imagery, free for development. Check its licensing
before shipping anything.
