# Getting it online

Front to back: a Supabase project, a GitHub repo, and a Vercel deployment. About
half an hour if nothing fights you, and something will — see
[When it breaks](#when-it-breaks).

Do them in this order. Vercel needs the Supabase keys at build time, so the
project has to exist first.

## 1. Supabase

Follow [supabase.md](supabase.md) — create the project, flip the two auth
settings, apply the four migrations. Come back with the **Project URL** and the
**anon key** from Project Settings → API.

Do not skip the auth settings. Anonymous sign-in off means nobody can get in at
all; email confirmation on means nobody can save a recovery code.

## 2. GitHub

The repository is already initialised with a first commit. Create an **empty**
repo on GitHub — no README, no `.gitignore`, no licence, or the first push will
be rejected for unrelated histories — then:

```bash
git remote add origin git@github.com:YOUR-USERNAME/haunt.git
```

```bash
git push -u origin main
```

`.env.local` is ignored and will not be pushed. Nothing secret is in the
repository; the anon key belongs in Vercel's environment, not in a file.

## 3. Vercel

Import the repo at [vercel.com/new](https://vercel.com/new). It reads
`vercel.json`, so the framework, build command, and output directory are already
right — leave them alone.

Before the first deploy, add three environment variables under **Settings →
Environment Variables**, ticked for Production, Preview, and Development:

| Name | Value |
| --- | --- |
| `VITE_DATA_SOURCE` | `supabase` |
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

These are inlined into the bundle at build time, which is why they must be set
*before* the build rather than added afterwards. **Changing any of them requires
a redeploy** — Vercel will not pick them up on its own.

Then deploy.

## 4. Point Supabase back at Vercel

Once you have a deployment URL, add it in Supabase under **Authentication → URL
Configuration**:

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** `https://your-app.vercel.app/**`

Preview deployments get their own URLs, so add `https://*-your-team.vercel.app/**`
if you want auth working on branch previews too.

## 5. Check it end to end

In order — each one depends on the last:

1. **The sign-in screen appears.** If you get "the map stayed dark" instead, the
   env vars are missing or wrong and the app fell through to a data error.
2. **"start here" works.** Failure here is anonymous sign-ins being off.
3. **A recovery code appears** after onboarding. Failure here is email
   confirmation being on.
4. **The code round-trips.** Note it, open the site in a private window, choose
   "I have a recovery code", and confirm you land on the same account.
5. **The map loads.** Empty is correct — a new account has no haunts and no
   friends. Drop one and it should appear.

## When it breaks

**"the map stayed dark" on first load.** The env vars did not reach the build.
Check they are set for the right environment, then redeploy — editing a variable
does not rebuild anything by itself.

**Everything fails with a permission error.** Almost always row-level security
doing its job against a request with no session. Confirm sign-in actually
completed before blaming a policy.

**Dropping a haunt fails.** It requires a real position: the browser must have
granted location, and the page must be on HTTPS. Vercel is HTTPS, so this is a
permission prompt that was declined.

**Photos do not appear.** The `haunt-media` bucket is private and reads go
through signed URLs. Check the storage policies from `0002_security.sql` applied,
and that uploaded paths look like `<profile-id>/<haunt-id>/photo-0.jpg`.

**A migration will not apply.** Expected — none of this SQL has run anywhere. Fix
it in the file rather than in the dashboard, so the repository stays the source
of truth, and commit the fix.

## Costs

Both free tiers carry this comfortably. Watch two things: Supabase pauses a free
project after a week of no activity, which looks exactly like an outage until you
resume it from the dashboard; and Esri's map tiles are free for development, so
check their licensing before this is anything other than a prototype.

## Going back to the mock backend

Set `VITE_DATA_SOURCE=mock` and redeploy, or just leave it unset locally. The
mock backend has no accounts, so the sign-in and recovery-code screens are
skipped entirely and the app opens straight onto the fixtures. Useful for
demoing without a network, and for telling an app bug apart from a schema one.
