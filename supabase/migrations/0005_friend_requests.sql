-- Haunt: asking to know someone.
--
-- The only way to reach a stranger, and deliberately narrow: you type their
-- exact handle. There is no directory, no prefix search, no suggestions — if you
-- do not already know what someone is called, you cannot find them. That is the
-- same rule the map runs on, applied to people.
--
-- These are functions rather than table writes because `profiles` is not
-- readable for someone you have no connection to, so a client cannot resolve a
-- handle to an id on its own. Security definer does the lookup and returns
-- nothing but success or a reason.

/*
 * Asks to know someone by handle.
 *
 * Asking someone who already asked you accepts instead — two people reaching for
 * each other should not end up waiting on each other.
 */
create or replace function public.send_friend_request(p_handle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_target   uuid;
  v_existing public.friendships%rowtype;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_target
    from public.profiles
   where handle = lower(ltrim(btrim(p_handle), '@'));

  -- Reveals that a handle exists, which is inherent to handles being shareable:
  -- a name you can tell someone is a name that can be checked.
  if v_target is null then
    raise exception 'no one goes by that name' using errcode = 'P0002';
  end if;
  if v_target = v_actor then
    raise exception 'that one is you' using errcode = '23514';
  end if;

  select * into v_existing
    from public.friendships
   where least(requester_id, addressee_id) = least(v_actor, v_target)
     and greatest(requester_id, addressee_id) = greatest(v_actor, v_target);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'you already know each other' using errcode = '23505';

    elsif v_existing.status = 'pending' then
      if v_existing.requester_id = v_actor then
        raise exception 'you have already asked them' using errcode = '23505';
      end if;
      -- They asked first. Asking back is an answer.
      update public.friendships
         set status = 'accepted', responded_at = now()
       where id = v_existing.id;
      return;

    else
      -- Previously ignored. A fresh ask is allowed, in either direction — one
      -- refusal should not lock two people apart forever.
      update public.friendships
         set requester_id = v_actor,
             addressee_id = v_target,
             status       = 'pending',
             created_at   = now(),
             responded_at = null
       where id = v_existing.id;
      return;
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_actor, v_target);
end;
$$;

/* Answers a request that was made to you. Ignoring is quiet: nobody is told. */
create or replace function public.respond_to_friend_request(p_handle text, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_from   uuid;
begin
  if v_actor is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select id into v_from
    from public.profiles
   where handle = lower(ltrim(btrim(p_handle), '@'));
  if v_from is null then
    raise exception 'no request from them' using errcode = 'P0002';
  end if;

  update public.friendships
     set status       = case when p_accept then 'accepted' else 'ignored' end,
         responded_at = now()
   where requester_id = v_from
     and addressee_id = v_actor
     and status = 'pending';

  if not found then
    raise exception 'no request from them' using errcode = 'P0002';
  end if;
end;
$$;

/*
 * Everything outstanding, both directions.
 *
 * Outgoing ones are included so an ask does not vanish into nothing while you
 * wait — the one social signal this app gives you about someone who has not
 * answered yet.
 */
create or replace function public.friend_requests()
returns table (handle text, direction text)
language sql
stable
security definer
set search_path = public
as $$
  select
    '@' || other.handle,
    case when f.addressee_id = auth.uid() then 'incoming' else 'outgoing' end
  from public.friendships f
  join public.profiles other
    on other.id = case
         when f.addressee_id = auth.uid() then f.requester_id
         else f.addressee_id
       end
  where f.status = 'pending'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.created_at;
$$;

revoke all on function public.send_friend_request(text)              from public, anon;
revoke all on function public.respond_to_friend_request(text, boolean) from public, anon;
revoke all on function public.friend_requests()                      from public, anon;

grant execute on function public.send_friend_request(text)              to authenticated;
grant execute on function public.respond_to_friend_request(text, boolean) to authenticated;
grant execute on function public.friend_requests()                      to authenticated;
