# Haunt product pass — 2026-08-15

## Scope

Full mobile-flow walkthrough at `http://localhost:5174/`, followed by implementation and a production build.

## Flow health

1. **Onboarding — healthy after fixes.** Welcome, story, handle validation, drop/explore choice, friend search, and completion were exercised. Empty primary actions now use native disabled semantics, friend search filters real mock users, and “drop my first haunt” now opens the creation flow instead of duplicating “explore map.”
2. **Map discovery — healthy after fixes.** Dumaguete map pan, wheel/pinch zoom, fixed-size haunt markers, haunt selection, list selection, profile, notifications, and drop entry were reviewed. Added visible zoom/recenter controls, persisted app state, real unread state, and a post-drop focus confirmation.
3. **Haunt arrival — healthy.** Missed-visit confirmation, arrival, visit logging, and visited state were exercised end to end.
4. **Passing a haunt — healthy after fixes.** Recipient selection, optional note, preview, confirmation, and success were exercised. The finder is no longer offered as their own recipient, controls expose selection state, and note length is bounded.
5. **Dropping a haunt — completed.** Place details, optional photo, story, private arrival note, audience, and zone selection now work. The map preview uses real Dumaguete tiles; the zone is clickable and keyboard-adjustable; the chosen zone, radius, and uploaded image are saved to the new haunt.
6. **Profile and social — healthy after fixes.** Own profile, friend profile, friend request state, saved haunts, and lineage were reviewed. Heading structure and selection semantics were corrected.
7. **Notifications — healthy after fixes.** The route works and opening it now clears the unread indicator instead of calling a no-op.
8. **Persistence and shell — healthy after fixes.** Onboarding, tab, friends, haunts, notification state, and missed visits persist locally. The mobile shell, tab bar, controls, focus states, and materials were refined toward a restrained Apple-like treatment while preserving the ominous grain and purple/green identity.

## Verification

- TypeScript project check: passed.
- Vite production build: passed (1,657 modules).
- Static unfinished-feature scan: no TODO, FIXME, “not implemented,” “coming soon,” or empty click-handler markers in `src`.
- The pre-change walkthrough covered every user-facing route and produced screenshots `01` through `16` in this folder.
- A post-change browser screenshot pass could not be completed because the in-app browser rejected the local reload under its URL security policy. No alternate browser or workaround was used. The changes were verified by type-checking, production build, and source-level flow checks.

## Evidence

- `01-onboarding-welcome.jpg` through `05-onboarding-friends.jpg`
- `06-map-home.jpg`
- `07-haunt-arrived.jpg` through `10-pass-confirmation.jpg`
- `11-drop-place.jpg` through `12-drop-zone.png`
- `13-profile.jpg` through `16-lineage.jpg`
