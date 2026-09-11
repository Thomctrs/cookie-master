-- Create schema tables. MUST sort before enable_rls (timestamp 20260100000000 < 20260101000000)
-- and before join_league (20260102000000), because those migrations only manage RLS/policies
-- and assume the tables already exist. On a fresh project applying them without this file
-- fails with `relation "public.profiles" does not exist` and the app can't find tables.
-- Column names match exactly what the client queries (see src/pages/Hub.jsx, LeagueView.jsx).
-- Keep column defaults where the client relies on benign DB values.

-- profiles: 1:1 with auth.users, always exists after first profile fetch.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

-- leagues: recruiting -> active.
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status text not null default 'recruiting',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- league_members: join table. Composite PK lets `league_members!inner` embed cleanly.
create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- league_schedule: who bakes which ISO week of the year.
create table if not exists public.league_schedule (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week_number int not null,
  year int not null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  turn_order int,
  created_at timestamptz not null default now(),
  unique (league_id, week_number, year)
);

-- ratings: voter -> baker for one week.
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  week_number int,
  taste int not null default 0,
  texture int not null default 0,
  appearance int not null default 0,
  baking int not null default 0,
  indulgence int not null default 0,
  score numeric,
  comment text,
  created_at timestamptz not null default now()
);
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
  );-- Joining a league by code while RLS hides leagues from non-members:
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
    raise exception 'Code introuvable. Vérifie le code partagé par tes collègues.';
  end if;

  if v_league.status <> 'recruiting' then
    raise exception 'Cette ligue est déjà lancée, la porte des fourneaux est fermée.';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = v_league.id and user_id = auth.uid()
  ) then
    raise exception 'Tu es déjà dans cette équipe de gourmands !';
  end if;

  insert into public.league_members (league_id, user_id)
  values (v_league.id, auth.uid());

  return v_league.id;
end;
$$;

revoke all on function public.join_league(text) from public;
grant execute on function public.join_league(text) to authenticated;-- create_league(): atomic create league + creator joins as member.
-- SECURITY DEFINER (runs as owner) -> bypasses RLS on leagues/league_members, so the
-- PostgREST INSERT..RETURNING re-check (SELECT policy on the returned row) can no longer
-- 403 the creator the moment they create a league with return=representation.
-- Same pattern as join_league(). Client calls supabase.rpc('create_league', {p_name, p_code}).

create or replace function public.create_league(p_name text, p_code text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.leagues%rowtype;
begin
  if p_name is null or trim(p_name) = '' then
    raise exception 'Il faut un nom pour cette ligue !';
  end if;

  insert into public.leagues (name, code, status, created_by)
  values (trim(p_name), upper(p_code), 'recruiting', auth.uid())
  returning * into v_row;

  insert into public.league_members (league_id, user_id)
  values (v_row.id, auth.uid());

  return v_row;
end;
$$;

revoke all on function public.create_league(text, text) from public;
grant execute on function public.create_league(text, text) to authenticated;-- One vote per (voter, league, ISO week). Prevents double-submit / races creating two
-- ratings for the same week, which the client-side `existingRating` check cannot stop.
--
-- NOTE: must be a real named CONSTRAINT (not a bare unique index) for PostgREST's
-- `INSERT ... ON CONFLICT (voter_id, league_id, week_number)` to resolve the target.
-- Fix #1: client upserts with onConflict matching this constraint.

-- Dedupe leftovers BEFORE adding the constraint (a duplicate would fail the DDL).
delete from public.ratings a
using public.ratings b
where a.id > b.id
  and a.voter_id = b.voter_id
  and a.league_id = b.league_id
  and a.week_number is not distinct from b.week_number;

-- Replace any earlier index-based attempt, then add the named constraint.
drop index if exists public.ratings_one_vote_week;

-- NULLable week_number honored: Postgres unique treats NULLs as distinct (legacy rows safe).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ratings_one_vote_week' and conrelid = 'public.ratings'::regclass
  ) then
    alter table public.ratings
      add constraint ratings_one_vote_week unique (voter_id, league_id, week_number);
  end if;
end $$;