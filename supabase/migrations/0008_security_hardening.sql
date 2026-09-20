-- Haunt: close the remaining direct client write paths.
--
-- RLS is still the row-level safety net, but table grants are a second, useful
-- boundary: the browser should only be able to read the few rows it needs and
-- should not be able to manufacture or rewrite server-owned state.

-- These tables are written by security-definer RPCs, never by the browser.
-- Keep the policies from 0002 as defence in depth, but remove the grants that
-- would let a client reach those policies directly.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
revoke insert, update, delete on public.keepsakes from anon, authenticated;
revoke insert, update, delete on public.notifications from anon, authenticated;

/*
 * The one notification mutation the UI needs is deliberately narrow. It can
 * only mark the caller's unread notifications as read; the client cannot
 * change recipient, actor, body, kind, or timestamps through a table update.
 */
create or replace function public.mark_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.notifications
     set read_at = coalesce(read_at, now())
   where recipient_id = auth.uid()
     and read_at is null;
end;
$$;

revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- Read RPCs are authenticated app APIs, not anonymous endpoints. The helper
-- functions remain executable by `authenticated` because RLS expressions and
-- the security-definer read functions call them internally.
revoke all on function public.friend_ids(uuid) from public, anon;
revoke all on function public.is_friend(uuid, uuid) from public, anon;
revoke all on function public.is_friend_of_friend(uuid, uuid) from public, anon;
revoke all on function public.can_see_haunt(uuid, uuid) from public, anon;
revoke all on function public.haunt_is_shrouded(uuid, uuid) from public, anon;
revoke all on function public.can_see_profile(uuid, uuid) from public, anon;
revoke all on function public.haunt_lineage(uuid, uuid) from public, anon;
revoke all on function public.haunt_feed(double precision, double precision, uuid)
  from public, anon;
revoke all on function public.profile_snapshot() from public, anon;
revoke all on function public.friend_list() from public, anon;
revoke all on function public.friend_requests() from public, anon;
revoke all on function public.missed_visit_id() from public, anon;

grant execute on function public.friend_ids(uuid) to authenticated;
grant execute on function public.is_friend(uuid, uuid) to authenticated;
grant execute on function public.is_friend_of_friend(uuid, uuid) to authenticated;
grant execute on function public.can_see_haunt(uuid, uuid) to authenticated;
grant execute on function public.haunt_is_shrouded(uuid, uuid) to authenticated;
grant execute on function public.can_see_profile(uuid, uuid) to authenticated;
grant execute on function public.haunt_lineage(uuid, uuid) to authenticated;
grant execute on function public.haunt_feed(double precision, double precision, uuid)
  to authenticated;
grant execute on function public.profile_snapshot() to authenticated;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.friend_requests() to authenticated;
grant execute on function public.missed_visit_id() to authenticated;
