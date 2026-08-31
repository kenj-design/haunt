# Handoff

Written for whoever picks this up next. Read this first, then
[architecture.md](architecture.md) before changing structure and
[supabase.md](supabase.md) before touching SQL.

## What it is

Haunt is a mobile social map. Friends hand each other real places; a place's
exact location stays hidden inside a vague zone, and the note waiting there
stays sealed until you physically arrive. Places travel person to person, never
through a feed.

It is **live and working**, not a prototype pretending to be one.

| | |
| --- | --- |
| Live | https://haunt-alpha.vercel.app |
| Repo | `github.com/kenj-design/haunt`, deploys from `main` |
| Supabase | project `ueftjjrdjdbwoiigdnxk` |
| Stack | React 19 + Vite + TS + Tailwind v4 · Postgres + PostGIS + RLS |

## The five rules that must not regress

Everything else is a feature. These are the product:

1. **A haunt's exact point never reaches a client.** `haunt_feed` returns a
   radius, a distance, and a centre snapped to a grid the size of the radius —
   and since `0007`, clients hold no grant on the `haunts` table at all, so
   reading the true column is not merely discouraged but impossible. Restoring
   that grant would undo this rule on its own, quietly.
2. **Anyone who is not a friend sees `???` and nothing else** — no name, no
   finder, no story, no note. Not hidden by the UI; absent from the response.
   Every shared haunt is on every map now, so this rule carries far more weight
   than it did when the outer ring stopped at friends-of-friends.
3. **The arrival note is sealed until you have arrived.** `haunt_feed` returns
   an empty note until `visits.arrived_at` is set.
4. **Arrival is geofenced.** `arrive_at_haunt` requires a position and refuses
   outside the zone. Its refusal reports the *shortfall*, never the true
   distance — that would let someone triangulate the point.
5. **Health numbers go only to the finder.** Separate table, own RLS policy.

If you change `haunt_feed`, `can_see_haunt`, or `haunt_is_shrouded`, re-test 2
and 3 by hand. Failing open leaks somebody's real location and nothing will tell
you.

## Shape

```
src/domain/     types + pure rules. No React, no I/O.
src/data/       the backend seam. dataSource.ts is the contract.
                mockDataSource.ts  — in-memory, and THE SPEC for what rules mean
                supabase/          — the real one
src/context/    AppProvider (state) + appState (contract + useApp hook)
src/screens/    one file per screen
src/lib/        geo, time, seeds, ids, recovery codes — all pure
supabase/migrations/  0001…0006
```

Dependency flow is one-way: screens → context → data → domain. **Only
`AppProvider` and `main.tsx` import `src/data`.** A screen importing a data
source is a bug.

**`mockDataSource.ts` is the specification.** When a rule is ambiguous — what a
visit costs, when a keepsake is minted, who may pass what — that file is the
answer and the SQL is expected to match. One exception, stated in the code:
arrival geofencing is Supabase-only, because the mock's zones sit on an abstract
plane with no geography to measure.

## Working here

**Node isn't on the default PATH.** Every shell needs:

```bash
export PATH="$HOME/.local/node/bin:$HOME/.local/share/pnpm:$PATH"
```

**Applying a migration.** No Supabase CLI is installed. Paste the file into the
SQL editor and run it. If it errors, **fix the migration file, not the
dashboard**, and commit — the repo is the source of truth.

**Deploying.** Push to `main`. Env vars are inlined at build time, so changing
one in Vercel requires a redeploy, not just a save.

**Testing.** There are no automated tests. Everything so far has been verified
by driving the browser by hand. That is the top structural gap — see backlog 3.

**Switching backends.** `VITE_DATA_SOURCE=mock` in `.env.local` runs the whole
app on fixtures with no accounts and no network. Useful for UI work and for
telling an app bug apart from a schema one. Remember to switch back.

## Traps already paid for

Do not rediscover these:

- **The Supabase SQL editor swallows `cmd+a`** unless you first click *directly
  on the editor line* — otherwise it selects the whole page and your paste
  replaces nothing. Click line 1, then paste.
- **`haunt_feed` run in the SQL editor returns zero rows.** That is correct: it
  gates on `auth.uid()`, which is null for the dashboard's `postgres` role.
  Test it from the app, or by calling the predicates with explicit UUIDs.
- **`ON CONFLICT DO UPDATE` cannot schema-qualify its target.** `visits.col`
  resolves; `public.visits.col` does not.
- **Never put a hook and a component in the same module.** React Fast Refresh
  invalidates it on every edit, forcing a remount during which stale children
  render against a torn-down context and throw. This is why `appState.ts` and
  `AppProvider.tsx` are separate.
- **`.toast-in` has `translate(-50%)` baked into its keyframes** — it only works
  on elements centred with `left-1/2`. Use `.banner-in` for full-width.
- **Leaflet fixes its pixel origin at creation.** A container measuring 0×0 at
  that moment poisons the projection permanently and no later `invalidateSize`
  recovers it. Both map components wait for a non-zero measurement; keep that.
- **Do not upgrade `maplibre-gl` past 5.x without checking the map still draws.**
  6.x derives its tile-parsing worker's URL at runtime from `import.meta.url`
  plus a filename it builds by string concatenation, which no bundler can follow:
  nothing gets emitted, the worker never starts, and the failure is completely
  silent — the map paints its background, requests no tiles, logs no error, and
  `isStyleLoaded()` just stays false forever. 5.x inlines the worker as a blob
  and works anywhere. `window.__map` in dev is how you tell that apart from a
  style bug: check `isStyleLoaded()` and `querySourceFeatures('basemap', …)`.
- **The fog that engulfs the screen on release is a canvas inside the drop
  screen's sticky action dock**, and `position: sticky` makes that dock a
  stacking context — so the dock's `z-index` decides whether the fog covers the
  header. It is 40 for that reason. Lowering it silently breaks the ceremony.
- **Instagram Stories cannot be reached from a web page**, so do not go looking
  for the deep link. `instagram-stories://share` needs the image handed over
  through the iOS pasteboard under Instagram's own UTI keys, and Android needs an
  `ADD_TO_STORY` intent carrying a bitmap; a browser can do neither. What works is
  `navigator.share({ files })` with a rendered image — the sheet opens with
  Instagram in it. That is what `lib/storyCard.ts` does, falling back to a
  download where file sharing is missing. The native app gets the real thing.
- **Geolocation is slow and blocking.** Positions are cached for 60s, refusals
  included. Arrival deliberately bypasses the cache — it needs a current fix.
  Do not "simplify" that away.

## Backlog, ranked

**1 — Health only ever declines.** `log_visit` drops `score` by 4 and `velocity`
by 8. *Nothing increments them.* Every haunt trends to permanently fogged and
never recovers. Needs a `pg_cron` job that walks haunts with no recent visits and
returns clarity toward 100, mirroring `mockDataSource`'s comment about quiet time
restoring it. ~15 lines. Highest value for the effort by a distance.

**2 — Nothing tells you anything happened.** No realtime, no polling. Someone
passes you a place and you never learn until you reload. Supabase Realtime on
`notifications` filtered by `recipient_id`, folded into the snapshot. Severe for
a social app.

**3 — No tests, anywhere.** Zero. The five rules above are guarded by nothing.
Highest-value target is the security predicates: assert a stranger gets
`can_see_haunt = false`, a friend-of-a-friend gets `haunt_is_shrouded = true`,
and `haunt_feed` withholds the note before arrival.

**4 — Notifications are asked for and never sent.** Onboarding requests the
permission for real and the browser really grants it, but nothing in the app
sends a notification: there is no service worker, no VAPID key pair and no push
endpoint. It is the last promise in onboarding that the app cannot keep — the
Contacts row was removed for the same reason and is not worth restoring, since
the Contact Picker exists only in Chrome on Android and this app has no directory
to turn a phone number into an account with.

**5 — Photo upload never exercised.** Bucket, policies, upload code and signed
URLs all exist; no file has been through them on Supabase — only on the mock
backend, where photos are object URLs and never leave the browser. The drop
confirmation and the detail gallery both show photos now, so a broken signing
path will be obvious rather than invisible. One drop with a photo, on a phone,
settles it.

**6 — Anonymous signup is an open door.** No CAPTCHA on auth, no cleanup of
abandoned anonymous accounts. Supabase warns about both.

**7 — `record_proximity` unproven end to end.** It writes `visits.near_at` and is
deployed, but the "did you make it?" prompt appearing purely from walking past
has not been observed — it needs the position controlled *at page load*. Check
it on a real phone.

**8 — Finish the drop flow.** `single` and `dated` lifespans are modelled and
enforced but unreachable: `DropHaunt` hardcodes `lasting`. `ImprintControls` and
`Residue` are built and waiting in `src/components/unwired/` (see its README).

**9 — The tab rail overlaps profile content.** The floating Map/Profile rail sits
at vertical centre-left over everything, so profile text scrolls under it. Its
geometry is fixed now — the glass and the buttons finally agree on a width — but
where it belongs is still a design decision nobody has made.

Not worth doing: the unwired zone picker. Dropping a haunt where you are standing
is arguably correct — you leave a place by being at it.

## Test data

Accounts from verification runs: `@alpha`, `@beta`, `@gamma`, `@testghost`,
`@ken`, plus anonymous ones. Clear them all with:

```sql
delete from auth.users where email like '%@haunt.invalid' or is_anonymous;
```

Free-tier Supabase pauses a project after about a week of no activity, which
looks exactly like an outage. Check the dashboard for a resume button before
debugging anything else.
