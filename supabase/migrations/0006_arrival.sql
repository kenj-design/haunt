-- Haunt: arriving somewhere has to mean being there.
--
-- Until now `arrive_at_haunt` took the client's word for it — which made the
-- rest of the privacy machinery decorative. Hiding a haunt's exact point behind
-- a zone does not protect it if the note inside opens on request. This checks
-- the position against the zone in PostGIS and refuses if you are outside.
--
-- A determined person can still lie to their own browser about where they are.
-- That is true of every consumer geofence and is not what this defends against;
-- it moves the bar from "press a button" to "spoof your GPS", which is the
-- difference between a promise and a suggestion.

/*
 * Records crossing into a haunt's zone, which unseals its arrival note.
 *
 * Takes the position rather than defaulting it, so there is no way to call this
 * without one — an arrival with no idea where you are is exactly what the old
 * signature allowed.
 */
drop function if exists public.arrive_at_haunt(uuid);

create or replace function public.arrive_at_haunt(
  p_haunt uuid,
  p_lat   double precision,
  p_lng   double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_haunt    public.haunts%rowtype;
  v_here     geography;
  v_distance double precision;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'haunt needs to know where you are' using errcode = '42501';
  end if;

  select * into v_haunt from public.haunts where id = p_haunt;
  if not found or not public.can_see_haunt(p_haunt, v_actor) then
    raise exception 'no haunt with that id' using errcode = 'P0002';
  end if;
  -- A friend of a friend has no note to unseal; they cannot arrive at something
  -- they are not yet allowed to know the shape of.
  if public.haunt_is_shrouded(p_haunt, v_actor) then
    raise exception 'this one is not yours to open yet' using errcode = '42501';
  end if;

  v_here := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_distance := ST_Distance(v_haunt.zone, v_here);

  if v_distance > v_haunt.zone_radius_m then
    -- Reports the shortfall, not the true distance to the point: telling someone
    -- exactly how far the centre is would let them triangulate it.
    raise exception 'you are still about % m away',
      greatest(10, round((v_distance - v_haunt.zone_radius_m) / 10) * 10)
      using errcode = '42501';
  end if;

  insert into public.visits (haunt_id, visitor_id, near_at, arrived_at)
  values (p_haunt, v_actor, now(), now())
  on conflict (haunt_id, visitor_id)
  do update set arrived_at = coalesce(visits.arrived_at, now());
end;
$$;

/*
 * Notices haunts the viewer has walked close to.
 *
 * This is what finally writes `visits.near_at`, the column the "did you make
 * it?" prompt reads and that nothing has ever populated — so that prompt has
 * been unreachable since it was built.
 *
 * "Close" is a little wider than the zone itself, because the point is to catch
 * someone who passed nearby without going in. Rows are only ever inserted, never
 * updated, so answering the prompt or arriving settles it for good.
 */
create or replace function public.record_proximity(
  p_lat double precision,
  p_lng double precision
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_here  geography;
  v_count int := 0;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_lat is null or p_lng is null then
    return 0;
  end if;

  v_here := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  insert into public.visits (haunt_id, visitor_id, near_at)
  select h.id, v_actor, now()
    from public.haunts h
   where not h.retired
     and (h.expires_on is null or h.expires_on >= current_date)
     and (h.sleep_until is null or h.sleep_until <= now())
     -- Your own places don't ask whether you made it.
     and h.finder_id <> v_actor
     and ST_DWithin(h.zone, v_here, h.zone_radius_m + 150)
     and public.can_see_haunt(h.id, v_actor)
     -- A shrouded haunt shouldn't announce itself by prompting about it.
     and not public.haunt_is_shrouded(h.id, v_actor)
  on conflict (haunt_id, visitor_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.arrive_at_haunt(uuid, double precision, double precision)
  from public, anon;
revoke all on function public.record_proximity(double precision, double precision)
  from public, anon;

grant execute on function public.arrive_at_haunt(uuid, double precision, double precision)
  to authenticated;
grant execute on function public.record_proximity(double precision, double precision)
  to authenticated;
