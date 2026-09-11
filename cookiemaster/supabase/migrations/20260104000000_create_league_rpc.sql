-- create_league(): atomic create league + creator joins as member.
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
    raise exception 'nom requis';
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
grant execute on function public.create_league(text, text) to authenticated;