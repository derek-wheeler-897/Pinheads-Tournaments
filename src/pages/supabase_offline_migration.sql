-- Pinheads Tournaments: atomic writes + offline sync
-- Run this migration once in Supabase SQL Editor.

alter table tournament_matches
  add column if not exists match_type text not null default 'regular';

alter table tournament_matches
  add column if not exists version integer not null default 1;

alter table tournament_matches
  add constraint tournament_matches_match_type_check
  check (match_type in ('regular','playoff'));

create unique index if not exists tournament_matches_one_playoff_per_tournament
  on tournament_matches (tournament_id)
  where match_type = 'playoff';

create table if not exists sync_operations (
  operation_id uuid primary key,
  operation_type text not null,
  created_at timestamptz not null default now(),
  result jsonb
);

alter table sync_operations enable row level security;

create or replace function sync_tournament_bundle(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament jsonb := p_payload->'tournament';
  v_players jsonb := coalesce(p_payload->'tournament_players', '[]'::jsonb);
  v_matches jsonb := coalesce(p_payload->'matches', '[]'::jsonb);
  v_match_players jsonb := coalesce(p_payload->'match_players', '[]'::jsonb);
  v_existing jsonb;
  v_id uuid;
begin
  select result into v_existing from sync_operations where operation_id = p_operation_id;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into tournaments (
    id, name, tournament_date, scoring_system, completed,
    tournament_type_id, total_rounds, status, completed_at, location_id
  )
  values (
    (v_tournament->>'id')::uuid,
    coalesce(v_tournament->>'name', 'Head-to-Head Tournament'),
    coalesce((v_tournament->>'tournament_date')::date, current_date),
    coalesce(v_tournament->>'scoring_system', '1/0'),
    coalesce((v_tournament->>'completed')::boolean, false),
    nullif(v_tournament->>'tournament_type_id','')::uuid,
    coalesce((v_tournament->>'total_rounds')::integer, 10),
    coalesce(v_tournament->>'status', 'active'),
    nullif(v_tournament->>'completed_at','')::timestamptz,
    nullif(v_tournament->>'location_id','')::uuid
  )
  on conflict (id) do update set
    name = excluded.name,
    tournament_date = excluded.tournament_date,
    scoring_system = excluded.scoring_system,
    completed = excluded.completed,
    tournament_type_id = excluded.tournament_type_id,
    total_rounds = excluded.total_rounds,
    status = excluded.status,
    completed_at = excluded.completed_at,
    location_id = excluded.location_id;

  insert into tournament_players (id, tournament_id, player_id, created_at)
  select
    (x->>'id')::uuid,
    (x->>'tournament_id')::uuid,
    (x->>'player_id')::uuid,
    coalesce((x->>'created_at')::timestamptz, now())
  from jsonb_array_elements(v_players) x
  on conflict (id) do update set player_id = excluded.player_id;

  insert into tournament_matches (
    id, tournament_id, round_number, machine_id, status, match_type, version, created_at
  )
  select
    (x->>'id')::uuid,
    (x->>'tournament_id')::uuid,
    (x->>'round_number')::integer,
    nullif(x->>'machine_id','')::uuid,
    coalesce(x->>'status','pending'),
    coalesce(x->>'match_type','regular'),
    greatest(coalesce((x->>'version')::integer,1),1),
    coalesce((x->>'created_at')::timestamptz, now())
  from jsonb_array_elements(v_matches) x
  on conflict (id) do update set
    round_number = excluded.round_number,
    machine_id = excluded.machine_id,
    status = excluded.status,
    match_type = excluded.match_type,
    version = greatest(tournament_matches.version, excluded.version);

  insert into tournament_match_players (
    id, match_id, player_id, position, points, created_at
  )
  select
    (x->>'id')::uuid,
    (x->>'match_id')::uuid,
    (x->>'player_id')::uuid,
    nullif(x->>'position','')::integer,
    coalesce((x->>'points')::integer,0),
    coalesce((x->>'created_at')::timestamptz, now())
  from jsonb_array_elements(v_match_players) x
  on conflict (id) do update set
    position = excluded.position,
    points = excluded.points;

  v_existing := jsonb_build_object(
    'ok', true,
    'tournament_id', (v_tournament->>'id')::uuid
  );

  insert into sync_operations(operation_id, operation_type, result)
  values (p_operation_id, 'tournament_bundle', v_existing);

  return v_existing;
end;
$$;

create or replace function record_match_result(
  p_operation_id uuid,
  p_match_id uuid,
  p_winner_player_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match tournament_matches%rowtype;
  v_existing jsonb;
  v_loser uuid;
  v_result jsonb;
begin
  select result into v_existing from sync_operations where operation_id = p_operation_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_match
  from tournament_matches
  where id = p_match_id
  for update;

  if not found then raise exception 'Match not found'; end if;
  if v_match.version <> p_expected_version then
    raise exception 'CONFLICT: Match was changed on another device. Refresh before recording this result.';
  end if;

  select player_id into v_loser
  from tournament_match_players
  where match_id = p_match_id and player_id <> p_winner_player_id
  limit 1;

  if v_loser is null then raise exception 'Match must contain exactly two players'; end if;

  update tournament_match_players set points = 1, position = 1 where match_id = p_match_id and player_id = p_winner_player_id;
  update tournament_match_players set points = 0, position = 2 where match_id = p_match_id and player_id = v_loser;
  update tournament_matches set status = 'completed', version = version + 1 where id = p_match_id;

  v_result := jsonb_build_object('ok', true, 'match_id', p_match_id, 'version', v_match.version + 1);
  insert into sync_operations(operation_id, operation_type, result) values (p_operation_id, 'match_result', v_result);
  return v_result;
end;
$$;

create or replace function undo_match_result(
  p_operation_id uuid,
  p_match_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match tournament_matches%rowtype;
  v_existing jsonb;
  v_result jsonb;
begin
  select result into v_existing from sync_operations where operation_id = p_operation_id;
  if v_existing is not null then return v_existing; end if;

  select * into v_match from tournament_matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if v_match.version <> p_expected_version then
    raise exception 'CONFLICT: Match was changed on another device. Refresh before undoing this result.';
  end if;

  update tournament_match_players set points = 0, position = null where match_id = p_match_id;
  update tournament_matches set status = 'pending', version = version + 1 where id = p_match_id;

  v_result := jsonb_build_object('ok', true, 'match_id', p_match_id, 'version', v_match.version + 1);
  insert into sync_operations(operation_id, operation_type, result) values (p_operation_id, 'undo_match_result', v_result);
  return v_result;
end;
$$;

create or replace function set_tournament_status(
  p_operation_id uuid,
  p_tournament_id uuid,
  p_status text,
  p_completed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result jsonb;
begin
  select result into v_existing from sync_operations where operation_id = p_operation_id;
  if v_existing is not null then return v_existing; end if;

  update tournaments
  set status = p_status,
      completed = p_completed,
      completed_at = case when p_status in ('completed','cancelled_saved') then coalesce(completed_at, now()) else completed_at end
  where id = p_tournament_id;

  if not found then raise exception 'Tournament not found'; end if;

  v_result := jsonb_build_object('ok', true, 'tournament_id', p_tournament_id);
  insert into sync_operations(operation_id, operation_type, result) values (p_operation_id, 'tournament_status', v_result);
  return v_result;
end;
$$;

create or replace function delete_tournament(
  p_operation_id uuid,
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_result jsonb;
begin
  select result into v_existing from sync_operations where operation_id = p_operation_id;
  if v_existing is not null then return v_existing; end if;

  delete from tournaments where id = p_tournament_id;
  v_result := jsonb_build_object('ok', true, 'tournament_id', p_tournament_id);
  insert into sync_operations(operation_id, operation_type, result) values (p_operation_id, 'delete_tournament', v_result);
  return v_result;
end;
$$;

grant execute on function sync_tournament_bundle(uuid,jsonb) to anon, authenticated;
grant execute on function record_match_result(uuid,uuid,uuid,integer) to anon, authenticated;
grant execute on function undo_match_result(uuid,uuid,integer) to anon, authenticated;
grant execute on function set_tournament_status(uuid,uuid,text,boolean) to anon, authenticated;
grant execute on function delete_tournament(uuid,uuid) to anon, authenticated;

-- Existing playoff rows created before this migration are regular by default.
-- If you already have a known playoff row, mark it manually once:
-- update tournament_matches set match_type='playoff' where id='...';
