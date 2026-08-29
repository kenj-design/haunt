-- Haunt: the write path.
--
-- Only mutations that touch several tables at once live here, so they happen in
-- one transaction rather than three round trips a dropped connection could tear
-- in half. Everything simpler — sharing a haunt, answering a friend request,
-- marking news read — is a plain update the client makes under RLS.
--
-- These run as security definer because they write to `haunt_health` and
-- `notifications`, which deliberately have no client-facing write policy at all.
-- Every one therefore starts by establishing who is calling and refusing if the
-- answer is nobody.

/* Claims a handle. Fails loudly if someone already holds it. */
create or replace function public.complete_onboarding(p_handle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_handle text := lower(ltrim(p_handle, '@'));
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.profiles
     set handle = v_handle, onboarded = true
   where id = v_actor;

exception
  when unique_violation then
    raise exception 'that handle is taken' using errcode = '23505';
end;
$$;

/*
 * Records crossing into a haunt's zone, which unseals its arrival note.
 *
 * Production checks this against a trusted position rather than the client's
 * word — a device claiming to be somewhere is not evidence that it is.
 */
create or replace function public.arrive_at_haunt(p_haunt uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.can_see_haunt(p_haunt, v_actor) then
    raise exception 'no haunt with that id' using errcode = 'P0002';
  end if;

  insert into public.visits (haunt_id, visitor_id, arrived_at)
  values (p_haunt, v_actor, now())
  on conflict (haunt_id, visitor_id)
  do update set arrived_at = coalesce(visits.arrived_at, now());
end;
$$;

/* Answers "not this time", so the prompt stops asking. */
create or replace function public.dismiss_missed_visit(p_haunt uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.visits
     set dismissed_at = now()
   where haunt_id = p_haunt
     and visitor_id = auth.uid()
     and arrived_at is null;
$$;

/*
 * Commits a visit: the lineage entry, the keepsake, the health dip, and the
 * quiet word to the finder.
 *
 * A visit costs the haunt a little clarity — busy places fog over on other
 * people's maps, and quiet time brings them back through a scheduled job. A
 * single-visit haunt burns out here and is gone for everyone.
 */
create or replace function public.log_visit(p_haunt uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_haunt    public.haunts%rowtype;
  v_named    boolean;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_haunt from public.haunts where id = p_haunt;
  if not found or not public.can_see_haunt(p_haunt, v_actor) then
    raise exception 'no haunt with that id' using errcode = 'P0002';
  end if;
  if public.haunt_is_shrouded(p_haunt, v_actor) then
    raise exception 'this haunt is not yours to visit yet' using errcode = '42501';
  end if;

  insert into public.visits (haunt_id, visitor_id, arrived_at, logged_at)
  values (p_haunt, v_actor, now(), now())
  on conflict (haunt_id, visitor_id) do update
    set arrived_at = coalesce(visits.arrived_at, now()),
        logged_at  = coalesce(visits.logged_at, now());

  -- One keepsake per person per haunt; coming back doesn't mint another.
  insert into public.keepsakes (haunt_id, owner_id)
  values (p_haunt, v_actor)
  on conflict (haunt_id, owner_id) do nothing;

  insert into public.haunt_health (haunt_id) values (p_haunt)
  on conflict (haunt_id) do nothing;

  update public.haunt_health
     set score      = greatest(0, score - 4),
         velocity   = greatest(0, velocity - 8),
         updated_at = now()
   where haunt_id = p_haunt;

  if v_haunt.lifespan = 'single' then
    update public.haunts set retired = true where id = p_haunt;
  end if;

  -- The finder hears that someone came, named only if they'd recognise them.
  if v_haunt.finder_id <> v_actor then
    v_named := public.can_see_profile(v_actor, v_haunt.finder_id);
    insert into public.notifications (recipient_id, kind, haunt_id, actor_id, body)
    values (
      v_haunt.finder_id,
      case when v_named then 'visit' else 'anon' end,
      p_haunt,
      case when v_named then v_actor else null end,
      case
        when v_named then
          '@' || (select handle from public.profiles where id = v_actor)
          || ' made it to ' || v_haunt.name
        else 'someone new made it to ' || v_haunt.name
      end
    );
  end if;
end;
$$;

/*
 * Creates a haunt from what the finder filled in.
 *
 * The finder is recorded as having been there, because they were — leaving a
 * haunt is a visit, and the app's counters say so too.
 */
create or replace function public.drop_haunt(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_haunt  uuid;
  v_friend uuid;
  v_handle text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.haunts (
    id, finder_id, name, story, arrival_note, arrival_note_kind,
    arrival_note_audio_path, arrival_note_audio_duration_s,
    audience, lifespan, expires_on, zone, zone_radius_m,
    vibe_tags, best_time_tags, photo_gradient, photo_paths, shroud_temperament
  )
  values (
    -- The client may name the id so photos can be uploaded to their final path
    -- before the row exists. A collision is a unique violation, not a takeover:
    -- the insert policy still pins finder_id to the caller.
    coalesce((nullif(p_payload ->> 'id', ''))::uuid, gen_random_uuid()),
    v_actor,
    p_payload ->> 'name',
    coalesce(p_payload ->> 'story', ''),
    coalesce(p_payload ->> 'arrival_note', ''),
    nullif(p_payload ->> 'arrival_note_kind', ''),
    nullif(p_payload ->> 'arrival_note_audio_path', ''),
    (p_payload ->> 'arrival_note_audio_duration_s')::int,
    coalesce(p_payload ->> 'audience', 'self'),
    coalesce(p_payload ->> 'lifespan', 'lasting'),
    (nullif(p_payload ->> 'expires_on', ''))::date,
    ST_SetSRID(
      ST_MakePoint((p_payload ->> 'lng')::double precision,
                   (p_payload ->> 'lat')::double precision),
      4326
    )::geography,
    coalesce((p_payload ->> 'zone_radius_m')::int, 200),
    coalesce(
      array(select jsonb_array_elements_text(p_payload -> 'vibe_tags')), '{}'::text[]
    ),
    coalesce(
      array(select jsonb_array_elements_text(p_payload -> 'best_time_tags')), '{}'::text[]
    ),
    p_payload ->> 'photo_gradient',
    coalesce(
      array(select jsonb_array_elements_text(p_payload -> 'photo_paths')), '{}'::text[]
    ),
    coalesce((p_payload ->> 'shroud_temperament')::smallint, 0)
  )
  returning id into v_haunt;

  insert into public.haunt_founders (haunt_id, profile_id) values (v_haunt, v_actor);

  -- Anyone who was there too, if they are actually a friend.
  for v_handle in
    select jsonb_array_elements_text(coalesce(p_payload -> 'founded_with', '[]'::jsonb))
  loop
    select id into v_friend
      from public.profiles
     where handle = lower(ltrim(v_handle, '@'));

    if v_friend is not null and public.is_friend(v_actor, v_friend) then
      insert into public.haunt_founders (haunt_id, profile_id)
      values (v_haunt, v_friend)
      on conflict do nothing;
    end if;
  end loop;

  insert into public.haunt_health (haunt_id) values (v_haunt);

  insert into public.visits (haunt_id, visitor_id, arrived_at, logged_at)
  values (v_haunt, v_actor, now(), now());

  return v_haunt;
end;
$$;

/*
 * Hands a haunt to one person.
 *
 * The note is not optional: a pass always carries one. The RLS policy on
 * `passes` independently enforces that you have been there and that they are a
 * friend, so this cannot be talked past by calling the table directly.
 */
create or replace function public.pass_haunt(
  p_haunt uuid,
  p_to_handle text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_to    uuid;
  v_name  text;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'a pass always carries a note' using errcode = '23514';
  end if;

  select id into v_to from public.profiles where handle = lower(ltrim(p_to_handle, '@'));
  if v_to is null then
    raise exception 'no one by that name' using errcode = 'P0002';
  end if;
  if not public.is_friend(v_actor, v_to) then
    raise exception 'a haunt only travels between friends' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.visits
    where haunt_id = p_haunt and visitor_id = v_actor and logged_at is not null
  ) then
    raise exception 'you can pass a haunt once you have been' using errcode = '42501';
  end if;

  select name into v_name from public.haunts where id = p_haunt;

  insert into public.passes (haunt_id, from_id, to_id, note)
  values (p_haunt, v_actor, v_to, btrim(p_note))
  on conflict (haunt_id, from_id, to_id)
  do update set note = excluded.note, created_at = now();

  -- The recipient is told a place is waiting, never which place.
  insert into public.notifications (recipient_id, kind, haunt_id, actor_id, body)
  values (
    v_to, 'pass', p_haunt, v_actor,
    '@' || (select handle from public.profiles where id = v_actor)
    || ' passed you somewhere worth knowing about'
  );
end;
$$;

-- Clients call these; nothing else in the schema is directly executable by them.
revoke all on function public.complete_onboarding(text)   from public, anon;
revoke all on function public.arrive_at_haunt(uuid)       from public, anon;
revoke all on function public.dismiss_missed_visit(uuid)  from public, anon;
revoke all on function public.log_visit(uuid)             from public, anon;
revoke all on function public.drop_haunt(jsonb)           from public, anon;
revoke all on function public.pass_haunt(uuid, text, text) from public, anon;

grant execute on function public.complete_onboarding(text)   to authenticated;
grant execute on function public.arrive_at_haunt(uuid)       to authenticated;
grant execute on function public.dismiss_missed_visit(uuid)  to authenticated;
grant execute on function public.log_visit(uuid)             to authenticated;
grant execute on function public.drop_haunt(jsonb)           to authenticated;
grant execute on function public.pass_haunt(uuid, text, text) to authenticated;

grant execute on function public.haunt_feed(double precision, double precision, uuid)
  to authenticated;
grant execute on function public.profile_snapshot() to authenticated;
grant execute on function public.friend_list()      to authenticated;
grant execute on function public.missed_visit_id()  to authenticated;

/*
 * New sign-ups get a profile automatically, with a placeholder handle they
 * replace in onboarding. Without this, a fresh account has nothing to join to.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle, onboarded)
  values (new.id, 'new' || substr(replace(new.id::text, '-', ''), 1, 12), false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
