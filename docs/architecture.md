# Architecture

How Haunt is put together, and the reasoning behind the parts that would
otherwise look arbitrary.

## The shape

```
  screens/  components/          what a person sees and touches
       │
       ▼
  context/AppProvider            snapshot cache + navigation
  context/appState               the contract screens read it through
       │
       ▼
  data/HauntDataSource           the seam: one interface, two implementations
       │                 ╲
       ▼                  ╲
  data/mockDataSource      data/supabase/…
       │                       │
       ▼                       ▼
  fixtures + localStorage   Postgres + PostGIS + RLS

  domain/    ◄── everyone depends on this; it depends on nothing
  lib/       ◄── pure helpers: geo, time, seeds, ids
```

The dependency rule runs one way. Screens know `domain` and `context`; `context`
knows `data`; `data` knows `domain`. Nothing reaches back up, and only two files
in the app import from `src/data` at all — `AppProvider` and `main.tsx`. A screen
importing a data source is a mistake worth catching in review.

## The domain model

`src/domain/` holds the types and the pure rules that go with them —
`isHauntActive`, `isGroupFounded`, `newHauntFromDraft`. No React, no I/O, no
knowledge of where anything is stored.

Field names are camelCase here and snake_case in Postgres. That is a deliberate
split, not an oversight: the app should read like TypeScript and the database
should read like SQL, and `src/data/supabase/mappers.ts` is the one place that
knows both. It is also where joins get flattened, storage keys become signed
URLs, and timestamps become "2 days ago".

### Viewer-resolved fields

The most useful idea in the model. Several fields on `Haunt` look like columns
and are not:

| Field | Actually |
| --- | --- |
| `status` | Your row in `visits` — locked, arrived, or visited |
| `visibility` | How many hops through the social graph this took to reach you |
| `distanceLabel` | Computed from wherever you are standing |
| `passedByHandle`, `passerNote` | The pass that reached *you*, not the haunt's history |
| `health` | Sent only to the finder |

Each carries a `viewer-resolved` comment in `src/domain/haunt.ts`. The app
consumes them flat, because a screen genuinely wants `haunt.status`; the backend
composes them per request. Naming this explicitly is what stops someone later
writing a `haunts.status` column and being confused when two people disagree
about it.

## The data seam

`HauntDataSource` ([src/data/dataSource.ts](../src/data/dataSource.ts)) is eleven
async methods. Two rules keep implementations honest:

**Every method is async, even when the mock answers instantly.** A synchronous
signature anywhere would let a caller assume something a network cannot do, and
the assumption would only surface once it was expensive to fix.

**Mutations return the records they changed.** The caller merges the response
rather than guessing at the outcome, so server-computed fields — counters,
lineage, health — always come from the server. When a mutation changes more than
it returns, that is a bug: `completeOnboarding` originally returned only the user
row while rewriting handles throughout the store, and the cached haunts kept
showing the old handle until a reload. It now returns a whole snapshot, and the
contract says why.

### `AppSnapshot`

Reads are one call, not five. The dataset is small and the map wants nearly all
of it at once, so a single snapshot beats five independent fetches and — more to
the point — five loading states to reason about. The Supabase implementation fans
it out into parallel queries behind that one method.

### Where the rules live

The business rules are in `mockDataSource.ts`, not in the context: what a visit
costs a haunt, when a keepsake is minted, when a single-visit haunt burns out,
who may pass what to whom. Those are a server's rules. Keeping them there means
the Supabase adapter has a precise specification to match rather than logic to
reinvent, and it means the context never has to change when a rule does.

When you need to change a rule, this is the table:

| Change | Where |
| --- | --- |
| What a field means | `src/domain/` |
| What a mutation does | `mockDataSource.ts`, then the matching SQL |
| How a row becomes a model object | `src/data/supabase/mappers.ts` |
| What a screen shows | `src/screens/` |
| Where something draws on a map | `src/lib/geo.ts` |

## State

`AppProvider` holds two things: a cache of the last snapshot, and where the
person is in the app. That is all.

The contract it satisfies — the `AppState` type, the `Screen` union, and the
`useApp` hook — lives next door in `appState.ts`. That split is not cosmetic:
React Fast Refresh only hot-updates a module whose exports are all components, so
a file exporting both the provider and the hook is invalidated on every edit,
forcing a full remount during which stale children render against a torn-down
context and throw. Keeping them apart keeps the dev loop quiet.

Navigation is a stack of `Screen` values rather than a router. The prototype has
no URLs worth having and every screen is reached from the map or the profile, so
a stack models it honestly and skips a dependency. A production build with deep
links would want a real router; nothing else here would move.

### Boot gating

`AppProvider` renders a `BootScreen` and does not mount its children until the
first snapshot arrives. That is why every field on the context is non-nullable
and no screen carries a `user?.handle`. The cost is that the whole app waits on
one request; the benefit is that no component ever has to render a half-loaded
world.

### `mutate()`

Every action goes through one helper that runs the request, folds the response
into the snapshot, tracks how many calls are in flight, and catches failures into
`error`. Each mutation resolves to whether it landed, so a screen that moves on
success can wait for the answer instead of assuming it:

```ts
// PassHaunt: the confirmation must not appear before the pass does.
if (await passHaunt(haunt.id, to, note.trim())) setStep(3)
```

On failure the snapshot simply never takes the change, so the UI still shows the
truth and the error toast explains why nothing moved. There is no rollback path
because there is nothing to roll back.

## A request, end to end

Logging a visit, from the tap to the pixels:

1. `HauntDetail` calls `logVisit(hauntId)` from the context.
2. `mutate()` increments the in-flight count and calls the data source.
3. **Mock:** appends a lineage entry, bumps the visitor count, mints a keepsake
   if this is a first visit, drops the health score, retires the haunt if its
   lifespan is `single`, and writes the store to local storage.
   **Supabase:** one `log_visit` RPC does the same in a single transaction, then
   the adapter re-reads the haunt through `haunt_feed` and the user through
   `profile_snapshot`.
4. Either way the response is `{ haunt, keepsake, user }`.
5. `mutate()` folds those into the snapshot; React re-renders; the screen shows
   the visited state and the profile shows one more keepsake.

The screen has no idea which backend answered.

## Security, and where it is enforced

Worth stating plainly because it shapes the schema: a place travels through
trust, so the database enforces that. A client asking for every haunt must simply
not get them.

Row-level security decides which **rows** are reachable. It cannot redact
**columns**, which is what the friend-of-a-friend rule needs — so `haunt_feed`
does that half, and clients read through the function rather than the table.
Neither is sufficient alone. A haunt's exact point is never returned to a client
at all; the map gets a centre snapped to a grid as wide as the zone's own radius.

The full picture is in [supabase.md](supabase.md).

## Things that change when the backend lands

Written down so they are not discovered one at a time:

- **The zone plane goes away.** `HauntZone.x`/`y` are 0–100 coordinates on an
  abstract plane that `src/lib/geo.ts` projects onto Dumaguete. Real data
  supplies `lat`/`lng` and `hauntLatLng()` already prefers them, so both backends
  render through the same path today.
- **Local persistence goes away.** The mock backend owns its own storage; the
  Supabase adapter has none. Nothing in the app layer knows about either.
- **Handles stop being identity.** Postgres keys everything on `profiles.id`.
  Handle equality in the mock is a stand-in for an identity join, not the real
  thing — which is exactly why claiming a handle has to rewrite lineage entries
  in the mock and does not need to on the server.
- **Time strings become timestamps.** Fixtures carry "2 days ago" directly; the
  backend sends ISO timestamps and `src/lib/time.ts` turns them back into words,
  on the reader's clock.
- **`window.haunt.reset()` goes away.** Development only, and stripped from
  production builds by `import.meta.env.DEV`.

## Conventions

- **Comments explain why, not what.** A comment restating the line below it is
  noise; a comment explaining a constraint that is not visible from the code
  earns its place.
- **Constants get names.** A magic number in a component is a number nobody can
  change confidently later.
- **Nothing hardcodes a coordinate or a tile URL** outside `src/lib/geo.ts`.
  Three copies of the same projection is how a map drifts out of agreement with
  itself.
- **Unwired code is labelled.** `src/components/unwired/` holds work that is
  built and not yet in a flow, with a README saying what each piece needs. It
  still typechecks against the live domain model, so it cannot rot quietly.
