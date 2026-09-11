-- RLS + policies: close trust boundary.
-- Apply via Supabase dashboard SQL editor, or `supabase db push` once project linked.
-- All client queries run as the logged-in user (anon key + JWT), so `authenticated` role grants.
-- Drops the permissive auto-policies the dashboard "Enable RLS" UI creates (they OR with ours
-- and would otherwise keep reads open to everyone).

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_schedule enable row level security;
alter table public.ratings enable row level security;

-- Drop Supabase dashboard auto-policies (select-all / insert-authenticated / email / user_id based).
do $$
declare t text;
begin
  foreach t in array array['profiles','leagues','league_members','league_schedule','ratings'] loop
    execute format('drop policy if exists "Enable read access for all users" on public.%I', t);
    execute format('drop policy if exists "Enable insert for authenticated users only" on public.%I', t);
    execute format('drop policy if exists "Enable update for users based on email" on public.%I', t);
    execute format('drop policy if exists "Enable delete for users based on user_id" on public.%I', t);
  end loop;
end $$;

-- profiles: any logged-in user may read usernames (leaderboards); only self can write.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (true);

drop policy if exists "profiles_self_manage" on public.profiles;
create policy "profiles_self_manage" on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- leagues: visible only to members, writable only by creator.
drop policy if exists "leagues_member_select" on public.leagues;
create policy "leagues_member_select" on public.leagues
  for select to authenticated
  using (id in (select league_id from public.league_members where user_id = auth.uid()));

drop policy if exists "leagues_create" on public.leagues;
create policy "leagues_create" on public.leagues
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "leagues_creator_update" on public.leagues;
create policy "leagues_creator_update" on public.leagues
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- league_members: see roster if member/creator, join only yourself, leave yourself.
drop policy if exists "league_members_select" on public.league_members;
create policy "league_members_select" on public.league_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or league_id in (select id from public.leagues where created_by = auth.uid())
    or league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid())
  );

drop policy if exists "league_members_join_self" on public.league_members;
create policy "league_members_join_self" on public.league_members
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "league_members_leave" on public.league_members;
create policy "league_members_leave" on public.league_members
  for delete to authenticated
  using (user_id = auth.uid() or league_id in (select id from public.leagues where created_by = auth.uid()));

-- league_schedule: read if member, insert if member (app auto-adds late joiners),
-- delete if creator. No direct update.
drop policy if exists "league_schedule_member_read" on public.league_schedule;
create policy "league_schedule_member_read" on public.league_schedule
  for select to authenticated
  using (league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid()));

drop policy if exists "league_schedule_member_insert" on public.league_schedule;
create policy "league_schedule_member_insert" on public.league_schedule
  for insert to authenticated
  with check (league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid()));

drop policy if exists "league_schedule_creator_delete" on public.league_schedule;
create policy "league_schedule_creator_delete" on public.league_schedule
  for delete to authenticated
  using (league_id in (select id from public.leagues where created_by = auth.uid()));

-- ratings: read if member. Vote rules enforced server-side:
-- * voter columns must be auth.uid()
-- * voter must be a league member
-- * target baker for that week must exist and must not be the voter (self-rating)
drop policy if exists "ratings_member_read" on public.ratings;
create policy "ratings_member_read" on public.ratings
  for select to authenticated
  using (league_id in (select lm.league_id from public.league_members lm where lm.user_id = auth.uid()));

drop policy if exists "ratings_vote" on public.ratings;
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

drop policy if exists "ratings_update_own" on public.ratings;
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