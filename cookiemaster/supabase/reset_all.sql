-- Reset complet : supprime policies, fonctions (RPC + helper RLS) et tables.
-- Idempotent (drop if exists). À lancer AVANT un re-init propre (init_db.sql).
-- Ordre: policies -> fonctions -> tables (enfants d'abord) -> séquence enum si présente.

do $$
declare t text; p text;
begin
  foreach t in array array['ratings','league_schedule','league_members','leagues','profiles'] loop
    for p in
      select polname from pg_policy pp
      join pg_class c on c.oid = pp.polrelid
      where c.relname = t and c.relnamespace = 'public'::regnamespace
    loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
  end loop;
end $$;

drop function if exists public.is_league_member(uuid);
drop function if exists public.join_league(text placeholder);

do $$
declare t text;
begin
  foreach t in array array['ratings','league_schedule','league_members','leagues','profiles'] loop
    execute format('drop table if exists public.%I cascade', t);
  end loop;
end $$;

drop type if exists public.league_status;
