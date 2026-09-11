-- One vote per (voter, league, ISO week). Prevents double-submit / races creating two
-- ratings for the same week, which the client-side `existingRating` check cannot stop.
-- NOTE: single blocking vote per judge per week, `postgres_changes` toast still fires.

-- Dedupe leftovers BEFORE adding the unique index (a duplicate would fail the DDL).
delete from public.ratings a
using public.ratings b
where a.id > b.id
  and a.voter_id = b.voter_id
  and a.league_id = b.league_id
  and a.week_number is not distinct from b.week_number;

-- NULLable week_number honored: Postgres unique treats NULLs as distinct (legacy rows safe).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'ratings' and indexname = 'ratings_one_vote_week'
  ) then
    create unique index ratings_one_vote_week on public.ratings (voter_id, league_id, week_number);
  end if;
end $$;