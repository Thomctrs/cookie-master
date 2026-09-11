-- One vote per (voter, league, ISO week). Prevents double-submit / races creating two
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