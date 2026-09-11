-- Fix "infinite recursion detected in policy for relation league_members".
--
-- Cause: the `league_members_select` policy's membership clause referenced the SAME table
-- (`league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid())`).
-- Postgres detects the self-cycle in the RLS policy evaluation and raises 42P17.
--
-- Fix: move the "am I a member of this league?" check into a SECURITY DEFINER helper.
-- A definer function runs as its owner (the table owner) and is NOT subject to RLS on the tables
-- it owns, so the nested `league_members` query inside it does not re-enter the recursive policy.
-- The policy then calls the helper instead of subquerying the table itself.
-- Apply AFTER 20260101000000_enable_rls.sql (it rewrites the policy created there).

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.league_members lm
     where lm.league_id = p_league_id
       and lm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;

-- Rewrite the recursive policy: view your own row, creator views their leagues, everyone
-- else is covered by the definer helper (no self-reference in the policy SQL anymore).
drop policy if exists "league_members_select" on public.league_members;
create policy "league_members_select" on public.league_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or league_id in (select id from public.leagues where created_by = auth.uid())
    or public.is_league_member(league_id)
  );
