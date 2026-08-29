-- Haunt: the read path.
--
-- Clients never select from `haunts` directly. They call `haunt_feed`, which is
-- where the friend-of-friend rule actually bites: RLS decides whether a row is
-- reachable, and this decides which of its columns come back. It also computes
-- the three things that depend on who is asking — status, visibility, and
-- distance — none of which are columns on any table.
--
-- Timestamps go out as timestamps. Turning them into "2 days ago" is the
-- client's job, in `src/lib/time.ts`.

/*
 * A haunt's chain, oldest first: who found it, who reached it, who passed it on.
 *
 * Anyone more than two hops from the viewer comes back as an entry with no
 * handle and the role 'anon' — the chain still shows that someone was there,
 * which is the point, without naming a stranger.
 */
create or replace function public.haunt_lineage(p_haunt uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with founder_count as (
    select count(*) as n from public.haunt_founders where haunt_id = p_haunt
  ),
  entries as (
    select
      f.profile_id as actor_id,
      case when (select n from founder_count) > 1
           then 'founded together' else 'found this place' end as action,
      h.created_at as happened_at,
      null::text as note,
      0 as ordinal
    from public.haunt_founders f
    join public.haunts h on h.id = f.haunt_id
    where f.haunt_id = p_haunt

    union all

    select v.visitor_id, 'made it here', v.logged_at, null::text, 1
    from public.visits v
    where v.haunt_id = p_haunt
      and v.logged_at is not null
      -- Founders are already listed above; don't repeat them as visitors.
      and not exists (
        select 1 from public.haunt_founders f
        where f.haunt_id = p_haunt and f.profile_id = v.visitor_id
      )

    union all

    select
      pa.from_id,
      'passed it to ' || case
        when pa.to_id = p_viewer then 'you'
        when public.can_see_profile(pa.to_id, p_viewer) then '@' || recipient.handle
        else 'someone'
      end,
      pa.created_at,
      pa.note,
      2
    from public.passes pa
    join public.profiles recipient on recipient.id = pa.to_id
    where pa.haunt_id = p_haunt
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'handle', case when named then '@' || actor.handle else null end,
        'role', case
          when e.actor_id = p_viewer then 'you'
          when not named then 'anon'
          when e.ordinal = 2 then 'passer'
          when e.ordinal = 0 and e.action = 'found this place' then 'finder'
          else 'visitor'
        end,
        'action', e.action,
        'happened_at', e.happened_at,
        'note', e.note
      )
      order by e.happened_at, e.ordinal
    ),
    '[]'::jsonb
  )
  from entries e
  join public.profiles actor on actor.id = e.actor_id
  cross join lateral (select public.can_see_profile(e.actor_id, p_viewer) as named) v;
$$;

/*
 * Everything the map and the haunt screens render.
 *
 * Pass the viewer's position to get distances; omit it and `distance_m` is null.
 * Pass `p_haunt` to re-read a single haunt after a mutation.
 *
 * Note what the client never receives: the zone's actual point. It gets a
 * centre snapped to a grid the size of the zone's own radius, which is enough to
 * draw the area on a map and useless for finding the spot — which is the whole
 * product rule, enforced here rather than trusted to the client.
 */
create or replace function public.haunt_feed(
  p_lat double precision default null,
  p_lng double precision default null,
  p_haunt uuid default null
)
returns table (
  id                             uuid,
  name                           text,
  finder_handle                  text,
  vibe_tags                      text[],
  best_time_tags                 text[],
  story                          text,
  arrival_note                   text,
  arrival_note_kind              text,
  arrival_note_audio_path        text,
  arrival_note_audio_duration_s  int,
  audience                       text,
  lifespan                       text,
  expires_on                     date,
  sleep_until                    timestamptz,
  retired                        boolean,
  zone_radius_m                  int,
  zone_lat                       double precision,
  zone_lng                       double precision,
  shroud_path                    jsonb,
  shroud_seed                    int,
  shroud_temperament             smallint,
  sigil_path                     jsonb,
  photo_gradient                 text,
  photo_paths                    text[],
  audio_path                     text,
  audio_duration_s               int,
  visitor_count                  int,
  founder_handles                text[],
  status                         text,
  visibility                     text,
  distance_m                     double precision,
  passed_by_handle               text,
  passer_note                    text,
  health                         jsonb,
  lineage                        jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (select auth.uid() as id),
  visible as (
    select h.*, public.haunt_is_shrouded(h.id, (select id from viewer)) as shrouded
    from public.haunts h
    where (p_haunt is null or h.id = p_haunt)
      and public.can_see_haunt(h.id, (select id from viewer))
  ),
  -- The most recent pass to this viewer is the one that reached them.
  received as (
    select distinct on (pa.haunt_id)
      pa.haunt_id, pa.note, sender.handle as sender_handle
    from public.passes pa
    join public.profiles sender on sender.id = pa.from_id
    where pa.to_id = (select id from viewer)
    order by pa.haunt_id, pa.created_at desc
  )
  select
    v.id,
    case when v.shrouded then '???' else v.name end,
    case when v.shrouded then null else '@' || finder.handle end,
    case when v.shrouded then '{}'::text[] else v.vibe_tags end,
    case when v.shrouded then '{}'::text[] else v.best_time_tags end,
    case when v.shrouded then '' else v.story end,
    -- The arrival note stays sealed until the viewer has actually arrived.
    case when v.shrouded or own_visit.arrived_at is null then '' else v.arrival_note end,
    case when v.shrouded or own_visit.arrived_at is null then null else v.arrival_note_kind end,
    case when v.shrouded or own_visit.arrived_at is null then null else v.arrival_note_audio_path end,
    case when v.shrouded or own_visit.arrived_at is null then null else v.arrival_note_audio_duration_s end,
    v.audience,
    v.lifespan,
    case when v.shrouded then null else v.expires_on end,
    v.sleep_until,
    v.retired,
    v.zone_radius_m,
    -- Snapped to a grid as wide as the zone: roughly radius/111320 degrees.
    ST_Y(ST_SnapToGrid(v.zone::geometry, v.zone_radius_m / 111320.0)),
    ST_X(ST_SnapToGrid(v.zone::geometry, v.zone_radius_m / 111320.0)),
    v.shroud_path,
    v.shroud_seed,
    v.shroud_temperament,
    case when v.shrouded then null else v.sigil_path end,
    v.photo_gradient,
    case when v.shrouded then '{}'::text[] else v.photo_paths end,
    case when v.shrouded then null else v.audio_path end,
    case when v.shrouded then null else v.audio_duration_s end,
    coalesce(logged.n, 0)::int,
    case when v.shrouded then '{}'::text[] else coalesce(founders.handles, '{}'::text[]) end,
    case
      when own_visit.logged_at is not null then 'visited'
      when own_visit.arrived_at is not null then 'arrived'
      else 'locked'
    end,
    case when v.shrouded then 'fof' else 'friend' end,
    case
      when p_lat is null or p_lng is null then null
      else ST_Distance(v.zone, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)
    end,
    case when v.shrouded then null else '@' || received.sender_handle end,
    case when v.shrouded then null else received.note end,
    -- Only the finder is handed the numbers; RLS on haunt_health says the same.
    case
      when v.finder_id = (select id from viewer) then
        jsonb_build_object(
          'score', hh.score, 'velocity', hh.velocity,
          'network_distance', hh.network_distance, 'conversion', hh.conversion
        )
      else null
    end,
    case when v.shrouded then '[]'::jsonb
         else public.haunt_lineage(v.id, (select id from viewer)) end
  from visible v
  join public.profiles finder on finder.id = v.finder_id
  left join public.visits own_visit
    on own_visit.haunt_id = v.id and own_visit.visitor_id = (select id from viewer)
  left join received on received.haunt_id = v.id
  left join public.haunt_health hh on hh.haunt_id = v.id
  left join lateral (
    select count(*) as n from public.visits vv
    where vv.haunt_id = v.id and vv.logged_at is not null
  ) logged on true
  left join lateral (
    select array_agg('@' || p.handle order by p.handle) as handles
    from public.haunt_founders f
    join public.profiles p on p.id = f.profile_id
    where f.haunt_id = v.id
  ) founders on true
  where not v.retired
    and (v.expires_on is null or v.expires_on >= current_date)
    and (v.sleep_until is null or v.sleep_until <= now());
$$;

/* The signed-in person, with counters derived rather than stored. */
create or replace function public.profile_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'handle', '@' || p.handle,
    'vibes', to_jsonb(p.vibes),
    'onboarded', p.onboarded,
    'member_since', p.created_at,
    'haunts_dropped', (select count(*) from public.haunts where finder_id = p.id),
    'haunts_visited', (select count(*) from public.visits
                       where visitor_id = p.id and logged_at is not null),
    'haunts_passed_on', (select count(*) from public.passes where from_id = p.id)
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

/* Accepted friends, with how many people the two of you share. */
create or replace function public.friend_list()
returns table (handle text, vibes text[], mutual_count int)
language sql
stable
security definer
set search_path = public
as $$
  select
    '@' || p.handle,
    p.vibes,
    (select count(*)::int
     from public.friend_ids(auth.uid()) mine
     join public.friend_ids(p.id) theirs on theirs = mine)
  from public.friend_ids(auth.uid()) f
  join public.profiles p on p.id = f
  order by p.handle;
$$;

/*
 * The haunt to ask "did you make it?" about.
 *
 * The geofence noticed the viewer nearby, they never crossed in, and they have
 * not waved the question away.
 */
create or replace function public.missed_visit_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select v.haunt_id
  from public.visits v
  where v.visitor_id = auth.uid()
    and v.arrived_at is null
    and v.dismissed_at is null
  order by v.near_at desc
  limit 1;
$$;
