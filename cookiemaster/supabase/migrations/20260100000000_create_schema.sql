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
  created_at timestptz not null default now(),
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
  created_at timestptz not null default now(),
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
  created_at timestptz not null default now()
);
