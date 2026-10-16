-- Haunt: keep PostGIS callable after it is moved into Supabase's `extensions`
-- schema. Existing projects may still have PostGIS in `public`; Supabase
-- Support must perform that move because the project role does not own the
-- extension's spatial_ref_sys table.
--
-- These functions use unqualified PostGIS names in already-applied definitions.
-- Including both schemas keeps them working before and after the supported
-- move. New installs also qualify PostGIS names in their function bodies.
alter function public.haunt_feed(double precision, double precision, uuid)
  set search_path = extensions, public, pg_temp;

alter function public.drop_haunt(jsonb)
  set search_path = extensions, public, pg_temp;

alter function public.arrive_at_haunt(uuid, double precision, double precision)
  set search_path = extensions, public, pg_temp;

alter function public.record_proximity(double precision, double precision)
  set search_path = extensions, public, pg_temp;

do $$
begin
  if exists (
    select 1
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'postgis'
       and n.nspname = 'public'
  ) then
    raise notice 'PostGIS is still in public. Ask Supabase Support to move it to extensions to clear the spatial_ref_sys Security Advisor warning.';
  end if;
end;
$$;
