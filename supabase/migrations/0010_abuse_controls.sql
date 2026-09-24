-- Haunt: abuse controls for the alpha.
--
-- These are deliberately server-side. The browser still keeps the experience
-- friendly, but a caller can always skip browser code and call Supabase APIs
-- directly. The controls below make that useful only within bounded limits.

-- A single private row is the owner's kill switch and tuning panel. It has no
-- client grants: update it from the Supabase SQL editor or with the maintenance
-- script in scripts/supabase-maintenance.mjs.
create table if not exists public.app_controls (
  id                             smallint primary key default 1 check (id = 1),
  new_accounts_enabled           boolean not null default true,
  drops_enabled                  boolean not null default true,
  media_uploads_enabled          boolean not null default true,
  anonymous_daily_drop_limit     integer not null default 3 check (anonymous_daily_drop_limit > 0),
  member_daily_drop_limit        integer not null default 20 check (member_daily_drop_limit > 0),
  anonymous_total_drop_limit     integer not null default 50 check (anonymous_total_drop_limit > 0),
  member_total_drop_limit        integer not null default 500 check (member_total_drop_limit > 0),
  anonymous_media_bytes_limit    bigint not null default 31457280 check (anonymous_media_bytes_limit > 0),
  member_media_bytes_limit       bigint not null default 104857600 check (member_media_bytes_limit > 0),
  updated_at                     timestamptz not null default now()
);

insert into public.app_controls (id)
values (1)
on conflict (id) do nothing;

alter table public.app_controls enable row level security;
revoke all on public.app_controls from public, anon, authenticated;

create index if not exists haunts_finder_created_idx
  on public.haunts (finder_id, created_at desc);

/*
 * Enforces the haunt quota for every insert, including future write paths.
 * Service-role maintenance writes have no end-user JWT and pass through this
 * trigger; normal browser writes carry the caller's JWT and are bounded.
 */
create or replace function public.enforce_haunt_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor          uuid := auth.uid();
  v_control        public.app_controls%rowtype;
  v_anonymous      boolean;
  v_daily_limit    integer;
  v_total_limit    integer;
  v_daily_count    integer;
  v_total_count    integer;
begin
  -- A trusted owner operation (service role / SQL editor) is not an end-user
  -- drop and should not be blocked by the alpha quota.
  if v_actor is null then
    return new;
  end if;
  if new.finder_id <> v_actor then
    raise exception 'you can only leave a haunt for yourself' using errcode = '42501';
  end if;

  select * into v_control
    from public.app_controls
   where id = 1;

  if not found or not v_control.drops_enabled then
    raise exception 'haunt drops are paused for a little while' using errcode = '55000';
  end if;

  -- Missing claims are treated conservatively as anonymous. A future auth
  -- token shape must not silently remove the cheaper limit.
  v_anonymous := coalesce(auth.jwt() ->> 'is_anonymous', 'true') <> 'false';
  if v_anonymous then
    raise exception 'save your recovery key before leaving a haunt' using errcode = '42501';
  end if;

  v_daily_limit := case when v_anonymous
                        then v_control.anonymous_daily_drop_limit
                        else v_control.member_daily_drop_limit end;
  v_total_limit := case when v_anonymous
                        then v_control.anonymous_total_drop_limit
                        else v_control.member_total_drop_limit end;

  select count(*) into v_daily_count
    from public.haunts
   where finder_id = v_actor
     and created_at >= now() - interval '24 hours';

  if v_daily_count >= v_daily_limit then
    raise exception 'you have reached today''s haunt limit' using errcode = 'P0001';
  end if;

  select count(*) into v_total_count
    from public.haunts
   where finder_id = v_actor;

  if v_total_count >= v_total_limit then
    raise exception 'you have reached your haunt limit' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_haunt_limits on public.haunts;
create trigger enforce_haunt_limits
before insert on public.haunts
for each row execute function public.enforce_haunt_limits();

revoke all on function public.enforce_haunt_limits() from public, anon;

/*
 * Storage is uploaded before the haunt row because the client names the final
 * object path up front. This policy therefore validates the path shape and
 * keeps a per-account byte budget while the later RPC enforces the haunt quota.
 * Orphaned objects are removed by the maintenance script after failed attempts.
 */
create or replace function public.haunt_media_upload_allowed(
  p_name      text,
  p_size_text text,
  p_mime      text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_actor       uuid := auth.uid();
  v_control     public.app_controls%rowtype;
  v_anonymous   boolean;
  v_limit       bigint;
  v_size        bigint;
  v_folders     text[];
  v_existing    bigint;
begin
  if v_actor is null then
    return false;
  end if;

  select * into v_control
    from public.app_controls
   where id = 1;
  if not found or not v_control.media_uploads_enabled then
    return false;
  end if;

  if p_size_text is null or p_size_text !~ '^[0-9]+$' then
    return false;
  end if;
  v_size := p_size_text::bigint;
  if v_size <= 0 or v_size > 5242880 then
    return false;
  end if;
  if coalesce(p_mime, '') !~ '^image/' then
    return false;
  end if;

  v_folders := storage.foldername(p_name);
  if coalesce(array_length(v_folders, 1), 0) <> 2
     or v_folders[1] <> v_actor::text
     or v_folders[2] !~ '^[0-9a-fA-F-]{36}$'
     or storage.filename(p_name) !~ '^photo-[0-2]\.(jpg|jpeg|png|webp|gif|heic|heif)$'
  then
    return false;
  end if;

  v_anonymous := coalesce(auth.jwt() ->> 'is_anonymous', 'true') <> 'false';
  -- Anonymous sessions may browse and finish onboarding, but they cannot
  -- reserve storage. Creating a recovery key is the account boundary.
  if v_anonymous then
    return false;
  end if;

  v_limit := case when v_anonymous
                  then v_control.anonymous_media_bytes_limit
                  else v_control.member_media_bytes_limit end;

  -- Exclude the same path for upserts, otherwise replacing a photo counts the
  -- old bytes and the new bytes against the account twice.
  select coalesce(sum(
    case
      when (metadata ->> 'size') ~ '^[0-9]+$'
        then (metadata ->> 'size')::bigint
      else 0
    end
  ), 0)
    into v_existing
    from storage.objects
   where bucket_id = 'haunt-media'
     and (storage.foldername(name))[1] = v_actor::text
     and name <> p_name;

  return v_existing + v_size <= v_limit;
end;
$$;

revoke all on function public.haunt_media_upload_allowed(text, text, text) from public, anon;
grant execute on function public.haunt_media_upload_allowed(text, text, text) to authenticated;

-- This is defence in depth for callers that skip the browser's 5 MB check.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/*']::text[]
 where id = 'haunt-media';

drop policy if exists haunt_media_insert on storage.objects;
create policy haunt_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'haunt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.haunt_media_upload_allowed(
      name,
      metadata ->> 'size',
      metadata ->> 'mimetype'
    )
  );

drop policy if exists haunt_media_update on storage.objects;
create policy haunt_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'haunt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'haunt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.haunt_media_upload_allowed(
      name,
      metadata ->> 'size',
      metadata ->> 'mimetype'
    )
  );

/*
 * The dashboard switch cannot stop Supabase from creating an anonymous auth
 * row, but it can stop a new anonymous visitor from completing onboarding.
 * Turning off anonymous sign-ins in Authentication settings remains the hard
 * stop; this is the repo-owned emergency switch for the app's write path.
 */
create or replace function public.complete_onboarding(p_handle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor       uuid := auth.uid();
  v_handle      text := lower(ltrim(p_handle, '@'));
  v_onboarded   boolean;
  v_new_accounts boolean;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select onboarded into v_onboarded
    from public.profiles
   where id = v_actor;
  select new_accounts_enabled into v_new_accounts
    from public.app_controls
   where id = 1;

  if not coalesce(v_onboarded, false) and not coalesce(v_new_accounts, true) then
    raise exception 'new accounts are paused for a little while' using errcode = '55000';
  end if;

  update public.profiles
     set handle = v_handle, onboarded = true
   where id = v_actor;

exception
  when unique_violation then
    raise exception 'that handle is taken' using errcode = '23505';
end;
$$;

revoke all on function public.complete_onboarding(text) from public, anon;
grant execute on function public.complete_onboarding(text) to authenticated;
