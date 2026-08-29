-- Haunt: core schema.
--
-- Shape notes that matter when reading the app code alongside this:
--
--   * Identity is a `profiles.id` UUID everywhere. The app model still speaks in
--     handles, so the mappers in `src/data/supabase/mappers.ts` do the swap.
--   * Handles are stored bare ("maya"). The leading "@" is presentation and is
--     added on the way out.
--   * A haunt's location is a real point plus a radius. The app never receives
--     the point — `haunt_feed` returns only the radius and a distance, so an
--     exact spot cannot leak through the client.
--   * Anything the app treats as viewer-resolved — status, visibility, distance,
--     the pass you received — lives in `visits` and `passes`, not on `haunts`.

create extension if not exists postgis;
create extension if not exists citext;

-- ---------------------------------------------------------------- people ----

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  handle      citext not null unique check (handle ~ '^[a-z0-9._]{3,30}$'),
  vibes       text[] not null default '{}',
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- One row per pair of people; the direction records who asked.
create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'ignored')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- Stops A→B and B→A both existing.
create unique index friendships_pair_idx on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);

-- ---------------------------------------------------------------- haunts ----

create table public.haunts (
  id                             uuid primary key default gen_random_uuid(),
  finder_id                      uuid not null references public.profiles (id) on delete cascade,
  name                           text not null check (char_length(name) between 1 and 50),
  story                          text not null default '',
  arrival_note                   text not null default '',
  arrival_note_kind              text check (arrival_note_kind in ('text', 'audio')),
  arrival_note_audio_path        text,
  arrival_note_audio_duration_s  int check (arrival_note_audio_duration_s > 0),
  audience                       text not null default 'self'
                                   check (audience in ('self', 'circle', 'wanderers')),
  lifespan                       text not null default 'lasting'
                                   check (lifespan in ('lasting', 'single', 'dated')),
  expires_on                     date,
  sleep_until                    timestamptz,
  retired                        boolean not null default false,
  -- The exact spot. Never sent to a client; see `haunt_feed`.
  zone                           geography(Point, 4326) not null,
  zone_radius_m                  int not null default 200
                                   check (zone_radius_m between 50 and 1000),
  vibe_tags                      text[] not null default '{}',
  best_time_tags                 text[] not null default '{}',
  shroud_path                    jsonb,
  shroud_seed                    int,
  shroud_temperament             smallint not null default 0
                                   check (shroud_temperament between 0 and 3),
  sigil_path                     jsonb,
  photo_gradient                 text not null,
  -- Object keys in the `haunt-media` bucket, cover first. The adapter signs them.
  photo_paths                    text[] not null default '{}',
  audio_path                     text,
  audio_duration_s               int check (audio_duration_s > 0),
  created_at                     timestamptz not null default now(),

  constraint haunts_dated_needs_date
    check (lifespan <> 'dated' or expires_on is not null),
  constraint haunts_audio_note_needs_path
    check (arrival_note_kind <> 'audio' or arrival_note_audio_path is not null),
  constraint haunts_photo_limit
    check (cardinality(photo_paths) <= 3)
);

create index haunts_zone_idx on public.haunts using gist (zone);
create index haunts_finder_idx on public.haunts (finder_id);
create index haunts_audience_idx on public.haunts (audience) where not retired;

-- Everyone present for the finding, the finder included.
create table public.haunt_founders (
  haunt_id    uuid not null references public.haunts (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (haunt_id, profile_id)
);

/*
 * One row per person per haunt, recording how far along they are.
 *
 *   near_at       the geofence saw them pass close by
 *   arrived_at    they crossed into the zone, which unseals the arrival note
 *   logged_at     they chose to record the visit
 *   dismissed_at  they answered "not this time" to the did-you-make-it prompt
 *
 * Status falls out of these: nothing or near only is 'locked', arrived without
 * logged is 'arrived', logged is 'visited'.
 */
create table public.visits (
  id            uuid primary key default gen_random_uuid(),
  haunt_id      uuid not null references public.haunts (id) on delete cascade,
  visitor_id    uuid not null references public.profiles (id) on delete cascade,
  near_at       timestamptz not null default now(),
  arrived_at    timestamptz,
  logged_at     timestamptz,
  dismissed_at  timestamptz,
  unique (haunt_id, visitor_id),
  constraint visits_logged_needs_arrival check (logged_at is null or arrived_at is not null)
);

create index visits_visitor_idx on public.visits (visitor_id);
create index visits_haunt_logged_idx on public.visits (haunt_id) where logged_at is not null;

-- A haunt handed to one person, with the note that has to come with it.
create table public.passes (
  id          uuid primary key default gen_random_uuid(),
  haunt_id    uuid not null references public.haunts (id) on delete cascade,
  from_id     uuid not null references public.profiles (id) on delete cascade,
  to_id       uuid not null references public.profiles (id) on delete cascade,
  note        text not null check (char_length(note) between 1 and 180),
  created_at  timestamptz not null default now(),
  constraint passes_not_self check (from_id <> to_id),
  unique (haunt_id, from_id, to_id)
);

create index passes_to_idx on public.passes (to_id, created_at desc);

create table public.keepsakes (
  id            uuid primary key default gen_random_uuid(),
  haunt_id      uuid not null references public.haunts (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  collected_at  timestamptz not null default now(),
  sigil_path    jsonb,
  unique (haunt_id, owner_id)
);

create index keepsakes_owner_idx on public.keepsakes (owner_id, collected_at desc);

-- A mark a visitor leaves behind. One per person per haunt, changeable.
create table public.residues (
  id          uuid primary key default gen_random_uuid(),
  haunt_id    uuid not null references public.haunts (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  mark        text not null check (mark in ('ring', 'cross', 'spark', 'wave')),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  unique (haunt_id, author_id)
);

/*
 * Private telemetry, readable only by the haunt's finder.
 *
 * A separate table rather than columns on `haunts` so the read policy is a flat
 * "are you the finder" instead of column-level redaction, which RLS cannot do.
 * Everyone else perceives `score` only as how densely the zone is shrouded.
 */
create table public.haunt_health (
  haunt_id          uuid primary key references public.haunts (id) on delete cascade,
  score             int not null default 100 check (score between 0 and 100),
  velocity          int not null default 100 check (velocity between 0 and 100),
  network_distance  int not null default 100 check (network_distance between 0 and 100),
  conversion        int not null default 100 check (conversion between 0 and 100),
  updated_at        timestamptz not null default now()
);

-- `anon` deliberately carries no actor: it reports the event, not the person.
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('visit', 'pass', 'anon')),
  haunt_id      uuid not null references public.haunts (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  body          text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  constraint notifications_anon_has_no_actor check (kind <> 'anon' or actor_id is null)
);

create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
