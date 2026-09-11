-- Joining a league by code while RLS hides leagues from non-members:
-- the code lookup + membership insert must run server-side (security definer).
-- Apply via dashboard SQL editor or `supabase db push`.

create or replace function public.join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues%rowtype;
begin
  select * into v_league
    from public.leagues
    where code = upper(p_code);

  if not found then
    raise exception 'code introuvable';
  end if;

  if v_league.status <> 'recruiting' then
    raise exception 'ligue deja lancee';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = v_league.id and user_id = auth.uid()
  ) then
    raise exception 'deja membre';
  end if;

  insert into public.league_members (league_id, user_id)
  values (v_league.id, auth.uid());

  return v_league.id;
end;
$$;

revoke all on function public.join_league(text) from public;
grant execute on function public.join_league(text) to authenticated;

-- Membership inserts now creator-only (their own league). Joins go through join_league().
drop policy if exists "league_members_join_self" on public.league_members;
create policy "league_members_add_creator" on public.league_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and league_id in (select id from public.leagues where created_by = auth.uid())
  );