-- Canonical RLS state. Idempotent drop-and-recreate of every policy, so production
-- converges to the exact final policy set in one shot, and fresh init_db.sql ends clean.
--
-- WHY: 20260101000000_enable_rls.sql defined the first policy generation, then
-- 20260103000000_fix_league_members_recursion.sql redefined the leagues/league_members
-- ones. Both are already applied in production, so they stay as history. This file is
-- the single source of truth for the FINAL policy set:
--
--   * leagues_{member_select,create,creator_update}   -> helper is_league_member()
--   * league_members_{select,leave}                   -> helper is_league_member()
--   * league_members_add_creator                      -> creator may add members pre-launch
--   * league_schedule_{member_read,member_insert,creator_delete}
--   * ratings_{member_read,vote,update_own}
--
-- And it REMOVES two leftovers:
--   * league_members_join_self (2006010300) :: re-opened a direct insert hole: any
--     authenticated user could INSERT their own (league_id, user_id) row and bypass
--     join_league() RPC (recruiting-check, code lookup, dedupe). Joins must go through
--     the RPC only; the client no longer inserts league_members directly (create_league
--     RPC handles the creator, SECURITY DEFINER).
--   * league_members_leave keeps the helper for creator kick; member self-leave via using(helper).

do $$
declare t text;
begin
  foreach t in array array['profiles','leagues','league_members','league_schedule','ratings'] loop
    execute format('drop policy if exists "profiles_select" on public.%I', t);
    execute format('drop policy if exists "profiles_self_manage" on public.%I', t);
    execute format('drop policy if exists "leagues_member_select" on public.%I', t);
    execute format('drop policy if exists "leagues_create" on public.%I', t);
    execute format('drop policy if exists "leagues_creator_update" on public.%I', t);
    execute format('drop policy if exists "league_members_select" on public.%I', t);
    execute format('drop policy if exists "league_members_join_self" on public.%I', t);
    execute format('drop policy if exists "league_members_add_creator" on public.%I', t);
    execute format('drop policy if exists "league_members_leave" on public.%I', t);
    execute format('drop policy if exists "league_schedule_member_read" on public.%I', t);
    execute format('drop policy if exists "league_schedule_member_insert" on public.%I', t);
    execute format('drop policy if exists "league_schedule_creator_delete" on public.%I', t);
    execute format('drop policy if exists "ratings_member_read" on public.%I', t);
    execute format('drop policy if exists "ratings_vote" on public.%I', t);
    execute format('drop policy if exists "ratings_update_own" on public.%I', t);
  end loop;
end $$;

-- profiles: any logged-in user may read usernames (leaderboards); only self can write.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (true);

create policy "profiles_self_manage" on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- leagues: read if member OR creator, writable only by creator.
create policy "leagues_member_select" on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

create policy "leagues_create" on public.leagues
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "leagues_creator_update" on public.leagues
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- league_members: members may read/leave; creator may add members (pre-launch roster).
create policy "league_members_select" on public.league_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_league_member(league_id));

create policy "league_members_add_creator" on public.league_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and league_id in (select id from public.leagues where created_by = auth.uid())
  );

create policy "league_members_leave" on public.league_members
  for delete to authenticated
  using (public.is_league_member(league_id));

-- league_schedule: members may read; members may insert (auto-assign late joiners);
-- creator may delete. No direct update.
create policy "league_schedule_member_read" on public.league_schedule
  for select to authenticated
  using (league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid()));

create policy "league_schedule_member_insert" on public.league_schedule
  for insert to authenticated
  with check (league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid()));

create policy "league_schedule_creator_delete" on public.league_schedule
  for delete to authenticated
  using (league_id in (select id from public.leagues where created_by = auth.uid()));

-- ratings: member reads; voting body is inserted via policy (must be self, member,
-- target baker in schedule, not self-rating), updates only own rows with same rules.
create policy "ratings_member_read" on public.ratings
  for select to authenticated
  using (league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid()));

create policy "ratings_vote" on public.ratings
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and voter_id = auth.uid()
    and league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid())
    and exists (
      select 1 from public.league_schedule s
      where s.league_id = ratings.league_id
        and s.week_number = ratings.week_number
        and s.assigned_user_id is not null
    )
    and not exists (
      select 1 from public.league_schedule s
      where s.league_id = ratings.league_id
        and s.week_number = ratings.week_number
        and s.assigned_user_id = auth.uid()
    )
  );

create policy "ratings_update_own" on public.ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and voter_id = auth.uid()
    and league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid())
    and exists (
      select 1 from public.league_schedule s
      where s.league_id = ratings.league_id
        and s.week_number = ratings.week_number
        and s.assigned_user_id is not null
    )
    and not exists (
      select 1 from public.league_schedule s
      where s.league_id = ratings.league_id
        and s.week_number = ratings.week_number
        and s.assigned_user_id = auth.uid()
    )
  );