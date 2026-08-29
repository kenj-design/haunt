-- Haunt: row-level security.
--
-- The product rule is that a place travels through trust, so the database has to
-- enforce it — a client asking for every haunt must simply not get them.
--
-- Three concentric rings:
--
--   your own       everything, including the private health numbers
--   your circle    accepted friends see haunts shared to 'circle'
--   one hop out    friends of friends learn a zone exists and nothing else
--
-- That last ring is column-level, which RLS cannot express, so the policies here
-- decide which *rows* are reachable and `haunt_feed` (in 0003) decides which
-- *columns* come back. Clients read through that function, never the table.

-- ------------------------------------------------------------- helpers ------

-- security definer so the lookup can see friendships the caller cannot read.
create or replace function public.friend_ids(p_profile uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when requester_id = p_profile then addressee_id else requester_id end
  from public.friendships
  where status = 'accepted'
    and (requester_id = p_profile or addressee_id = p_profile);
$$;

create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null
     and exists (select 1 from public.friend_ids(a) f where f = b);
$$;

-- Shares at least one friend, but is not a friend themselves.
create or replace function public.is_friend_of_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and a <> b
     and not public.is_friend(a, b)
     and exists (
       select 1
       from public.friend_ids(a) mine
       join public.friend_ids(b) theirs on theirs = mine
     );
$$;

/*
 * Whether `p_viewer` may see that `p_haunt` exists at all.
 *
 * Being able to see a haunt is not the same as being able to read it: a friend
 * of a friend passes this check and still receives only a shrouded zone.
 */
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
        or (h.audience = 'wanderers')
        or (
          h.audience = 'circle'
          and (public.is_friend(h.finder_id, p_viewer)
               or public.is_friend_of_friend(h.finder_id, p_viewer))
        )
      )
  );
$$;

-- Whether the viewer gets the full record or only a shrouded zone.
create or replace function public.haunt_is_shrouded(p_haunt uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.haunts h
    where h.id = p_haunt
      and (
        h.finder_id = p_viewer
        or exists (select 1 from public.haunt_founders f
                   where f.haunt_id = h.id and f.profile_id = p_viewer)
        or exists (select 1 from public.passes pa
                   where pa.haunt_id = h.id and pa.to_id = p_viewer)
        or h.audience = 'wanderers'
        or public.is_friend(h.finder_id, p_viewer)
      )
  );
$$;

-- Whether one person's handle may be shown to another, or must read as anonymous.
create or replace function public.can_see_profile(p_subject uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_subject = p_viewer
      or public.is_friend(p_subject, p_viewer)
      or public.is_friend_of_friend(p_subject, p_viewer)
      -- Someone with a request pending between you: you have to be able to read
      -- their handle to decide whether to accept it.
      or exists (
        select 1 from public.friendships f
        where f.status = 'pending'
          and ((f.requester_id = p_subject and f.addressee_id = p_viewer)
            or (f.requester_id = p_viewer and f.addressee_id = p_subject))
      );
$$;

-- ------------------------------------------------------------ policies ------

alter table public.profiles       enable row level security;
alter table public.friendships    enable row level security;
alter table public.haunts         enable row level security;
alter table public.haunt_founders enable row level security;
alter table public.visits         enable row level security;
alter table public.passes         enable row level security;
alter table public.keepsakes      enable row level security;
alter table public.residues       enable row level security;
alter table public.haunt_health   enable row level security;
alter table public.notifications  enable row level security;

-- profiles: visible two hops out, so lineage can name the people you know.
-- Anyone further away is rendered as anonymous by `haunt_lineage`.
create policy profiles_select on public.profiles
  for select using (public.can_see_profile(id, auth.uid()));

create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- friendships: only the two people involved.
create policy friendships_select on public.friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy friendships_insert on public.friendships
  for insert with check (requester_id = auth.uid());

-- Only the person who was asked may accept or ignore.
create policy friendships_update on public.friendships
  for update using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

create policy friendships_delete on public.friendships
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());

-- haunts: reachable per the rings above; only the finder may change one.
create policy haunts_select on public.haunts
  for select using (public.can_see_haunt(id, auth.uid()));

create policy haunts_insert on public.haunts
  for insert with check (finder_id = auth.uid());

create policy haunts_update on public.haunts
  for update using (finder_id = auth.uid()) with check (finder_id = auth.uid());

create policy haunts_delete on public.haunts
  for delete using (finder_id = auth.uid());

create policy haunt_founders_select on public.haunt_founders
  for select using (public.can_see_haunt(haunt_id, auth.uid()));

create policy haunt_founders_insert on public.haunt_founders
  for insert with check (
    exists (select 1 from public.haunts h
            where h.id = haunt_id and h.finder_id = auth.uid())
  );

-- visits: your own always; other people's only where you can see the haunt, and
-- even then `haunt_lineage` anonymises anyone outside your circle.
create policy visits_select on public.visits
  for select using (
    visitor_id = auth.uid() or public.can_see_haunt(haunt_id, auth.uid())
  );

create policy visits_insert on public.visits
  for insert with check (
    visitor_id = auth.uid() and public.can_see_haunt(haunt_id, auth.uid())
  );

create policy visits_update on public.visits
  for update using (visitor_id = auth.uid()) with check (visitor_id = auth.uid());

create policy passes_select on public.passes
  for select using (
    from_id = auth.uid() or to_id = auth.uid() or public.can_see_haunt(haunt_id, auth.uid())
  );

-- You may only pass a haunt you have actually been to, and only to a friend.
create policy passes_insert on public.passes
  for insert with check (
    from_id = auth.uid()
    and public.is_friend(auth.uid(), to_id)
    and exists (
      select 1 from public.visits v
      where v.haunt_id = haunt_id and v.visitor_id = auth.uid() and v.logged_at is not null
    )
  );

create policy keepsakes_select on public.keepsakes
  for select using (owner_id = auth.uid());

create policy keepsakes_insert on public.keepsakes
  for insert with check (owner_id = auth.uid());

create policy residues_select on public.residues
  for select using (public.can_see_haunt(haunt_id, auth.uid()));

create policy residues_write on public.residues
  for all
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.visits v
      where v.haunt_id = haunt_id and v.visitor_id = auth.uid() and v.logged_at is not null
    )
  );

-- health: the finder and nobody else. No client write path at all — only the
-- security-definer functions in 0004 touch these numbers.
create policy haunt_health_select on public.haunt_health
  for select using (
    exists (select 1 from public.haunts h
            where h.id = haunt_id and h.finder_id = auth.uid())
  );

create policy notifications_select on public.notifications
  for select using (recipient_id = auth.uid());

create policy notifications_update on public.notifications
  for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ------------------------------------------------------------- storage ------

-- Photos and voice notes are private. Paths are `<profile_id>/<haunt_id>/<file>`,
-- so the first path segment is the owner and access checks read it directly.
insert into storage.buckets (id, name, public)
values ('haunt-media', 'haunt-media', false)
on conflict (id) do nothing;

create policy haunt_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'haunt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy haunt_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'haunt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy haunt_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'haunt-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

/*
 * Reading media is gated on the haunt, not the folder: anyone who can see the
 * haunt in full may fetch its photos. Shrouded viewers never learn the paths,
 * because `haunt_feed` does not return them.
 */
create policy haunt_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'haunt-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.haunts h
        where h.id::text = (storage.foldername(name))[2]
          and public.can_see_haunt(h.id, auth.uid())
          and not public.haunt_is_shrouded(h.id, auth.uid())
      )
    )
  );
