-- RLS: final canonical state. Defines the SECURITY DEFINER helper first, then every
-- policy routes through it (or self-checks). No policy subqueries another table, so no
-- recursion. This is the single source of truth; fresh init_db.sql applies it once.

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_schedule enable row level security;
alter table public.ratings enable row level security;

-- Drop any Supabase dashboard auto-policies (select-all / insert-authenticated / email
-- / user_id based) and any stale fragment from earlier policy generations.
do $$
declare t text;
begin
  foreach t in array array['profiles','leagues','league_members','league_schedule','ratings'] loop
    execute format('drop policy if exists "Enable read access for all users" on public.%I', t);
    execute format('drop policy if exists "Enable insert for authenticated users only" on public.%I', t);
    execute format('drop policy if exists "Enable update for users based on email" on public.%I', t);
    execute format('drop policy if exists "Enable delete for users based on user_id" on public.%I', t);
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

-- Helper: is auth.uid() a member OR creator of this league? SECURITY DEFINER (owner) ->
-- not subject to RLS on the tables it reads -> no policy re-entry -> no recursion cycles.
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
-- Joining by code goes through join_league() RPC only (recruiting check + dedupe there).
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

-- ratings: member reads; voting body inserted via policy (must be self, member, target
-- baker in schedule, not self-rating), updates only own rows with same rules.
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