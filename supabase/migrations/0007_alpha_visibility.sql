-- Wider map for the alpha, and the hole that widening it would have opened.
--
-- Two changes, and the second is the reason the first is safe.
--
-- 1. Every *shared* haunt is now on everyone's map. With a handful of users, a
--    map gated on friends-of-friends is an empty map, which reads as a broken
--    app rather than a quiet one.
--
-- 2. Clients lose direct table access to anything haunt-shaped. Row-level
--    security decides *rows*, never columns — and a `haunts` row carries the
--    exact point and the sealed arrival note. Supabase grants `authenticated`
--    table-level select by default, so until now any signed-in viewer could
--    skip `haunt_feed` entirely and read the true coordinates and unopened note
--    of every haunt they could see. Narrow while the outer ring was
--    friends-of-friends; total the moment that ring becomes everyone.
--
-- What does NOT change: `haunt_is_shrouded`. Anyone who is not the finder, a
-- co-founder, someone it was passed to, or a direct friend still gets `???` — a
-- radius, a distance, and a centre snapped to a grid as wide as the zone. No
-- name, no finder, no story, no note, no photos, no health. The map fills up and
-- nothing leaks; rules 1 to 5 in docs/handoff.md all still hold.
--
-- And a haunt still marked 'self' stays invisible to everyone but its own
-- people. The drop screen promises that on screen, and this file has no business
-- breaking it.

-- ── 1. the outer ring ───────────────────────────────────────────────────────

create or replace function public.can_see_haunt(p_haunt uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.haunts h
    where h.id = p_haunt
      and p_viewer is not null
      and (
        h.finder_id = p_viewer
        -- Everyone who found it together keeps access, whatever the audience.
        or exists (
          select 1 from public.haunt_founders f
          where f.haunt_id = h.id and f.profile_id = p_viewer
        )
        -- A pass grants access on its own; it is how a haunt travels.
        or exists (
          select 1 from public.passes pa
          where pa.haunt_id = h.id and pa.to_id = p_viewer
        )
        -- Anything its finder has shared is on every map. The friend and
        -- friend-of-a-friend rings that used to gate this now decide only who
        -- sees *through* the fog — see haunt_is_shrouded, which is unchanged.
        or h.audience <> 'self'
      )
  );
$$;

-- ── 2. sharing becomes an RPC, so the client needs no table privileges ──────

/*
 * Was a plain `update` from the client, which is why `haunts` still had to be
 * writable — and therefore readable — by `authenticated`. It is the last write
 * in the app that was not already a function.
 */
create or replace function public.share_haunt(p_haunt uuid, p_story text)
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

  update public.haunts
     set audience = 'circle',
         story = btrim(coalesce(p_story, ''))
   where id = p_haunt
     and finder_id = v_actor;

  if not found then
    raise exception 'only its finder can share a haunt' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.share_haunt(uuid, text) from public, anon;
grant execute on function public.share_haunt(uuid, text) to authenticated;

-- ── 3. take the tables away from the client ─────────────────────────────────

/*
 * Everything the app needs from these goes through a `security definer`
 * function, which runs as the owner and is unaffected. What stops working is a
 * raw `select` from a client — which is the point. The policies stay in place
 * underneath: if a grant is ever restored by accident, rows are still gated.
 *
 * `keepsakes`, `profiles`, `notifications`, `friendships` and `friend_requests`
 * keep their grants; the app reads those directly and none of them holds a
 * coordinate or a sealed note.
 */
revoke all on public.haunts         from anon, authenticated;
revoke all on public.haunt_founders from anon, authenticated;
revoke all on public.haunt_health   from anon, authenticated;
revoke all on public.visits         from anon, authenticated;
revoke all on public.passes         from anon, authenticated;
revoke all on public.residues       from anon, authenticated;
