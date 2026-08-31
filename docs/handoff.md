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
   radius, a distance, and a centre snapped to a grid the size of the radius.
2. **Friend-of-a-friend sees `???` and nothing else** — no name, no finder, no
   story, no note. Not hidden by the UI; absent from the response.
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
- **The fog that engulfs the screen on release is a canvas inside the drop
  screen's sticky action dock**, and `position: sticky` makes that dock a
  stacking context — so the dock's `z-index` decides whether the fog covers the
  header. It is 40 for that reason. Lowering it silently breaks the ceremony.
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

**4 — Photo upload never exercised.** Bucket, policies, upload code and signed
URLs all exist; no file has been through them. Could simply be broken.

**5 — Anonymous signup is an open door.** No CAPTCHA on auth, no cleanup of
abandoned anonymous accounts. Supabase warns about both.

**6 — `record_proximity` unproven end to end.** It writes `visits.near_at` and is
deployed, but the "did you make it?" prompt appearing purely from walking past
has not been observed — it needs the position controlled *at page load*. Check
it on a real phone.

**7 — Finish the drop flow.** `single` and `dated` lifespans are modelled and
enforced but unreachable: `DropHaunt` hardcodes `lasting`. `ImprintControls` and
`Residue` are built and waiting in `src/components/unwired/` (see its README).

**8 — The tab rail clips profile content.** The floating Map/Profile rail sits at
vertical centre-left over everything. Cosmetic, pre-existing.

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
