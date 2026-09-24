# Supabase backend

Haunt runs on a mock backend by default. This describes the real one: what the
schema looks like, why it is shaped that way, how to stand it up, and — read this
part first — what has and has not actually been tested.

## Status

**Applied and working** against project `ueftjjrdjdbwoiigdnxk`, verified
2026-08-29 with three connected accounts (`@alpha`, `@beta`, `@gamma`) in
isolated browser sessions on the live deployment:

- **Accounts.** Anonymous sign-in, `complete_onboarding`, and a recovery code
  that survived a full session wipe and brought the same account back.
- **Asking and accepting.** `@beta` asked `@alpha` by exact handle; `@alpha`
  accepted.
- **The friendship gate.** `@alpha`'s haunt was **invisible** to `@beta` before
  they connected and appeared immediately after. `can_see_haunt` does that, not
  the UI.
- **The arrival note stays sealed.** Before arriving, `@beta` could read the
  story but the note was **not in the response at all** — withheld by
  `haunt_feed`, not hidden by the client. It appeared on arrival.
- **`drop_haunt`, `log_visit`, `pass_haunt`.** All three write correctly;
  lineage grew to `@alpha → @beta`, and the finder was notified by name.
- **Friend-of-a-friend shrouding.** `@gamma` — friend of `@beta`, stranger to
  `@alpha` — sees `???` and nothing else. The payload was searched for the name,
  the finder, the story, and the note: **none present**. Before connecting to
  `@beta`, `@gamma` saw nothing at all.
- **Arrival is geofenced.** With `@beta`'s visit reset and a spoofed position
  6.6 km out, "mark that I'm here" was refused — *"you are still about 6640 m
  away"*, the haunt stayed locked, and the note stayed out of the payload. From
  150 m, inside the 200 m zone, it succeeded and the note appeared.

The predicates were also unit-tested in SQL and fail closed: a stranger gets
`can_see_haunt = false` and `haunt_is_shrouded = true`, and `haunt_feed` run as
the `postgres` superuser returns **zero rows**, because it gates on `auth.uid()`
rather than on role.

Shrouding is the rule worth re-testing after any change to `haunt_feed` or
`haunt_is_shrouded`: failing open leaks somebody's private place.

### Still unverified

- **`record_proximity` firing on its own.** The function is deployed and
  `arrive_at_haunt` writes `near_at`, but the "did you make it?" prompt
  appearing purely from walking past has not been seen end to end — testing it
  needs control of the position *at page load*, before the app asks for it, and
  a browser geolocation override was not available here. Worth checking on a
  real phone, which is where it matters anyway.
- **Photo upload and signed URLs.** The storage policies applied but no file has
  been through them.
- **Health decay recovery.** The dip on visit works; nothing restores it yet.

### Known behaviour, not bugs

**No realtime.** Another person's activity appears on your next load, not as it
happens — `@alpha` had to reload before `@beta`'s visit notification showed.
Supabase Realtime on `notifications` would close that gap.

**`spatial_ref_sys` has RLS disabled.** That is PostGIS's read-only catalogue of
map projections, created and owned by the extension. It holds no user data, and
every table in this schema does have RLS on.


## The shape of it

```
src/data/
  dataSource.ts        the contract both backends implement
  mockDataSource.ts    the prototype's backend, and the spec for the rules
  index.ts             createDataSource() — the one switch point
  supabase/
    client.ts          the client, created once
    rows.ts            snake_case row types
    mappers.ts         rows <-> domain model
    supabaseDataSource.ts
supabase/migrations/
  0001_schema.sql      tables and indexes
  0002_security.sql    RLS policies and the helper functions behind them
  0003_reads.sql       haunt_feed, haunt_lineage, profile_snapshot, friend_list
  0004_writes.sql      the compound mutations, as RPCs
  0005_friend_requests.sql  asking to know someone, by exact handle
  0006_arrival.sql     arrival checked against a real position
  0007_alpha_visibility.sql  every shared haunt on every map, as fog — and the
                             client's table access revoked, because that widening
                             would otherwise have handed out coordinates
  0008_security_hardening.sql  remaining direct writes removed; notification
                               updates narrowed to one authenticated RPC
 0009_lock_anonymous_reads.sql  anonymous table endpoints removed for the
                                remaining read-only tables
 0010_abuse_controls.sql       server-side quotas, media limits, and a private
                                emergency switch for the alpha
```

`mockDataSource.ts` is the specification. When a rule is ambiguous — what a visit
costs a haunt, when a keepsake is minted, who may pass what to whom — that file
is the answer, and the SQL is expected to match it.

## Three ideas the schema is built on

**Identity is a UUID; handles are decoration.** Every join is on `profiles.id`.
Handles are stored bare (`maya`) and the leading `@` is added in `mappers.ts`.
The app model still speaks in handles, which is the mapper's whole job.

**A haunt's location never reaches the client.** `haunts.zone` is a PostGIS
point, and `haunt_feed` does not return it. Clients get the radius, a distance
from wherever they are, and a centre snapped to a grid as wide as the radius —
enough to draw an area, useless for finding the spot. That is the product rule,
and it is enforced in the database rather than trusted to the UI.

**Viewer-resolved fields are not columns.** `status`, `visibility`,
`distanceLabel`, and the pass you received all depend on who is asking, so they
live in `visits` and `passes` and are computed per request. The domain model
marks each one with a `viewer-resolved` comment for exactly this reason.

## Sessions, and what actually ends one

Set under **Authentication → Sessions**, and worth knowing because the account has
no other way back in:

| Setting | Value | Why |
| --- | --- | --- |
| Access token expiry | **86400** (24h) | Was the 3600 default. A longer token means the app opens from cache on bad signal instead of blocking on a refresh — which matters for something used while walking around. The cost is revocation latency: an access token is checked by signature alone, so a stolen one works until it expires. The dashboard allows up to 604800 (a week); a day is the compromise. |
| Time-box user sessions | 0 (off) | No forced end. |
| Inactivity timeout | 0 (off) | No idle end. |
| Refresh token reuse interval | 10s | Default. |

So nothing on the server ever ends a session. What ends one is the browser losing
the single `localStorage` key the refresh token lives in — and on iOS Safari that
happens after **seven days without a visit**, unless the app has been added to the
Home Screen, which moves it to storage the seven-day cap does not touch. `main.tsx`
asks for persistent storage on boot for the same reason.

None of this is recoverable server-side: the recovery code is derived from itself
and stored nowhere, so eviction without a saved code is account loss. Which is why
the app is installable — `index.html` carries a manifest and the Apple meta tags,
so iOS offers a real web app rather than a bookmark, and the recovery screen and
the profile both say where that button is when the visitor is on iOS and has not
used it.

## Visibility, and where it is enforced

Three concentric rings:

| Ring | Sees |
| --- | --- |
| Your own | Everything, including the private health numbers |
| Your circle | Accepted friends see haunts shared to `circle`, in full |
| Everyone else | That a zone exists, and nothing else |

The outer ring used to stop at friends-of-friends. It is now everyone, because an
alpha with a handful of users had an empty map — see `0007_alpha_visibility.sql`.
A haunt still marked `self` is outside all of this and stays invisible.

Row-level security decides which **rows** are reachable. It cannot redact
**columns**, which is what the outer ring needs — so `haunt_feed` does that part,
and clients read through the function rather than the table. That last clause is
now enforced rather than merely intended: `0007` revokes every client grant on
`haunts`, `haunt_founders`, `haunt_health`, `visits`, `passes` and `residues`, so
`select zone, arrival_note from haunts` is not a thing a client can do. Before
that it was, for any row the predicate allowed. The two work together and neither
is sufficient alone:

- `can_see_haunt(haunt, viewer)` — the RLS predicate on `haunts`.
- `haunt_is_shrouded(haunt, viewer)` — whether the columns come back redacted.
- `can_see_profile(subject, viewer)` — whether a handle may be shown, or the
  lineage entry reads as `anon` instead. That is how a stranger's visit shows up
  as "someone new made it" rather than a name.

Private telemetry sits in its own table, `haunt_health`, so its policy is a flat
"are you the finder" rather than column-level redaction. Nothing has a client
write path to it at all.

## Why some mutations are RPCs

Logging a visit writes a visit row, mints a keepsake, moves the health numbers,
possibly retires the haunt, and notifies the finder. Five statements from a
client is five chances for a dropped connection to leave the data half-changed,
so it is one function in `0004_writes.sql` and one transaction.

Simpler mutations — sharing a haunt, answering a friend request, marking news
read — are plain updates the client makes under RLS. If a policy is the only rule
involved, a policy is enough.

## Standing it up

1. Create a project at [supabase.com](https://supabase.com). Note the project
   URL and the anon key from **Project Settings → API**.

2. Turn on two auth settings. Both are required and the app does not work
   without them — see [Accounts](#accounts) for why.

   - **Authentication → Providers → Anonymous sign-ins: on.** Opening the app
     creates an account this way.
   - **Authentication → Providers → Email → Confirm email: off.** Securing an
     account writes a deliberately undeliverable `@haunt.invalid` address, so a
     confirmation step would strand every account at the moment it is created.

3. Apply the migrations, in order. With the CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   Or paste each file into the SQL editor in filename order. `0001` enables the
   `postgis` and `citext` extensions; if your plan or region blocks either, stop
   there rather than working around it — the zone column depends on PostGIS.

4. Point the app at it:

   ```bash
   cp .env.example .env.local
   ```

   ```
   VITE_DATA_SOURCE=supabase
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

5. Restart the dev server. Vite reads `.env.local` at startup only.

The anon key ships inside the client bundle. That is safe **only** because RLS is
enabled on every table and direct grants are kept narrow — the key identifies the
app, and the signed-in user's JWT decides what they can reach. If RLS were ever
disabled on a table, or a broad grant were added back, that key
becomes a public door to it.

## Accounts

There is no email field anywhere, and no password to invent. Opening the app
calls `signInAnonymously()`, which is a real `auth.users` row with a real
session; the `handle_new_user` trigger gives it a profile, and every policy
treats it like any other user.

That account lives on one device. A **recovery code** is what moves it:

- 16 characters, 80 bits of randomness, shown exactly once.
- Both halves of a credential — an `@haunt.invalid` address and a password — are
  derived from the code by SHA-256. Making the code calls
  `updateUser({ email, password })` on the anonymous account, upgrading it in
  place. The user id never changes, so nothing they have made is re-keyed.
- Entering the code on another device recomputes the same pair and signs in.
- Nothing stores the code, or a hash of it, or a list of which codes exist. That
  is why it cannot be shown twice, and why nobody can look it up for a user who
  lost it.

The security rests on the code's entropy. 80 bits against Supabase's per-IP auth
rate limiting is far past brute force.

### Admin recovery for alpha support

The original code cannot be retrieved: it is never stored. For an alpha tester
who loses theirs, the owner can run the local emergency reset command with the
Supabase service-role key supplied only in the shell environment:

```sh
VITE_SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SECRET_KEY=your-secret-key \
node scripts/admin-reset-recovery.mjs @handle
```

The command confirms the target handle, invalidates its old code, and prints one
new code. Never put the service-role key in Vercel, the browser bundle, or a
client-side admin screen; it bypasses RLS and belongs only in a trusted owner
operation.

The older `service_role` key also works if that is the only elevated key your
project shows, but Supabase now recommends the `secret` key.

Two things are still worth doing before this is public:

- **Turn on CAPTCHA** for auth endpoints (Authentication → Settings). Anonymous
  sign-in is otherwise an open door to creating rows.
- **Clean up abandoned anonymous accounts.** Anyone who opens the app and leaves
  without making a code is a permanent row. A scheduled job deleting
  `auth.users` where `is_anonymous` and `created_at < now() - interval '30 days'`
  keeps that from accumulating.

The repository now also includes server-side abuse controls in
`0010_abuse_controls.sql`. The defaults are intentionally generous for an
alpha, but are real backend limits rather than UI hints:

- anonymous users: no drops and no media uploads until they create a recovery
  key;
- recovered/member accounts: 20 drops per rolling 24 hours, 500 total, and
  100 MB of media;
- each media object: 5 MB maximum, image MIME types only, and only the expected
  `<profile>/<haunt>/photo-N.ext` path shape.

The browser's existing three-photo limit remains, and the database still caps a
haunt at three stored paths. The new storage policy is what stops a direct API
caller from bypassing the browser's file-size check. Failed uploads can still
leave an orphan for a short time because the app uploads before the final haunt
transaction; run the owner-only maintenance script periodically:

```sh
VITE_SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SECRET_KEY=your-secret-key \
node scripts/supabase-maintenance.mjs report
```

The same script supports `cleanup` (dry-run by default), `cleanup --apply`,
`pause`, and `resume`. `pause` blocks onboarding completion, haunt drops, and
media uploads through the private `app_controls` row. It does not replace
turning off anonymous sign-ins in Authentication settings, which is the hard
stop for new auth rows.

## What is missing

**Geofencing.** `visits.near_at` is what the missed-visit prompt reads, and
nothing writes it yet. It wants a background location task posting nearby haunts,
which is a native concern; the PRD's React Native target is where that lands.

**Health decay.** `log_visit` applies the dip. Nothing restores it. That is a
scheduled job — `pg_cron` calling a function that walks quiet haunts and returns
clarity to them.

**Notification delivery.** Rows are written; nothing pushes them.

**Residues and sigils.** Modelled in the schema and in the domain, with the UI
built and sitting in `src/components/unwired/`. Neither has a write path yet.

## Verifying it

In rough order of how likely each is to be wrong:

1. **Anonymous sign-in works at all.** If the provider is off, the sign-in
   screen fails on "start here" with the reason Supabase gives.
2. **A recovery code round-trips.** Make one, note it, open the app in a private
   window, choose "I have a recovery code", and confirm you land on the same
   account with the same haunts. If email confirmation is still on, this is
   where it fails.
3. **The migrations apply cleanly.** They have never been run. Expect to fix
   something.
4. **`haunt_feed` returns rows at all.** It is the largest function here and
   everything reads through it. Call it directly in the SQL editor as a real user
   before blaming the client.
5. **Shrouding actually shrouds.** Sign in as a friend-of-a-friend and confirm
   the name comes back `???` with no story, no arrival note, and no photo paths.
   This is the rule most worth a test, because failing open leaks a place.
6. **The arrival note stays sealed.** `haunt_feed` returns an empty note until
   `visits.arrived_at` is set. Check it before arriving, not only after.
7. **`haunt_health` is unreadable by anyone but the finder.** Query it directly
   as another user and confirm you get nothing.
8. **Storage paths line up.** Photos upload to
   `<profile_id>/<haunt_id>/photo-N.<ext>`, and the read policy parses the second
   segment as a haunt id. A change to either has to change both.

Once a project exists, generate the row types instead of hand-maintaining them:

```bash
supabase gen types typescript --project-id <id> > src/data/supabase/database.types.ts
```

Then narrow `rows.ts` to the generated `Database` type and drop the
`.returns<T>()` assertions in `supabaseDataSource.ts` — they exist only because
the client is currently untyped, and with real types a schema change becomes a
compile error instead of a runtime surprise.
