-- Haunt: do not expose even read-only table endpoints to anonymous clients.
-- Authenticated app reads remain available and are still filtered by RLS.

revoke all on public.profiles from anon;
revoke all on public.keepsakes from anon;
revoke all on public.notifications from anon;

grant select on public.profiles to authenticated;
grant select on public.keepsakes to authenticated;
grant select on public.notifications to authenticated;
