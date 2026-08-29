# Supabase backend

Haunt runs on a mock backend by default. This describes the real one: what the
schema looks like, why it is shaped that way, how to stand it up, and — read this
part first — what has and has not actually been tested.

## Status

**The SQL, the adapter, and the auth gateway have never run against a live
Supabase project.** They are written carefully and the TypeScript typechecks, but
no migration has been applied and no query has been executed. The sign-in and
recovery-code screens have been exercised against a stand-in gateway, so the UI
and the code format are known good; what Supabase does with them is not. Treat the first run as a bring-up, not a
deployment, and work through [Verifying it](#verifying-it) before trusting it.

Everything else in the app — the domain model, the data-source seam, the mock
backend — is exercised and working.

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

## Visibility, and where it is enforced

Three concentric rings:

| Ring | Sees |
| --- | --- |
| Your own | Everything, including the private health numbers |
| Your circle | Accepted friends see haunts shared to `circle`, in full |
| One hop out | Friends of friends learn a zone exists, and nothing else |

Row-level security decides which **rows** are reachable. It cannot redact
**columns**, which is what the third ring needs — so `haunt_feed` does that part,
and clients read through the function rather than the table. The two work
together and neither is sufficient alone:

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
enabled on every table — the key identifies the app, and the signed-in user's JWT
decides what they can reach. If RLS were ever disabled on a table, that key
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
rate limiting is far past brute force. Two things worth doing before this is
public:

- **Turn on CAPTCHA** for auth endpoints (Authentication → Settings). Anonymous
  sign-in is otherwise an open door to creating rows.
- **Clean up abandoned anonymous accounts.** Anyone who opens the app and leaves
  without making a code is a permanent row. A scheduled job deleting
  `auth.users` where `is_anonymous` and `created_at < now() - interval '30 days'`
  keeps that from accumulating.

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
