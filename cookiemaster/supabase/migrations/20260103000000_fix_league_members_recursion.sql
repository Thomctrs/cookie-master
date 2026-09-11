-- Root fix for "infinite recursion detected in policy for relation league_members" (42P17).
--
-- Cause: TWO nested cycles between the RLS policies:
--   A) self-cycle: policy league_members_select subqueried league_members (same table).
--   B) mutual cycle: policy leagues_member_select (on leagues) subqueried league_members,
--      while league_members_select subqueried leagues. Each policy re-ran the other's RLS.
--
-- Fix: route EVERY cross-table membership/creator check through a single SECURITY DEFINER
-- helper. A definer function runs as its owner (the table owner) -> NOT subject to RLS on
-- the tables it owns, so the nested `league_members` / `leagues` queries inside it never
-- re-enter any policy. No policy therefore subqueries the other table anymore -> no cycle.
--
-- The helper answers "is auth.uid() a member of this league, OR its creator?".
-- Policies only call the helper; NOTHING else. Apply AFTER 20260101000000_enable_rls.sql.

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members lm
     where lm.league_id = p_league_id and lm.user_id = auth.uid()
  )
  or exists (
    select 1 from public.leagues l
     where l.id = p_league_id and l.created_by = auth.uid()
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;

-- leagues: read if member OR creator (helper only, no subquery into league_members).
drop policy if exists "leagues_member_select" on public.leagues;
create policy "leagues_member_select" on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

drop policy if exists "leagues_create" on public.leagues;
create policy "leagues_create" on public.leagues
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "leagues_creator_update" on public.leagues;
create policy "leagues_creator_update" on public.leagues
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- league_members: your own rows, or anything via helper (no self/other table subquery).
drop policy if exists "league_members_select" on public.league_members;
create policy "league_members_select" on public.league_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_league_member(league_id));

drop policy if exists "league_members_join_self" on public.league_members;
create policy "league_members_join_self" on public.league_members
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "league_members_leave" on public.league_members;
create policy "league_members_leave" on public.league_members
  for delete to authenticated
  using (public.is_league_member(league_id));
