import { supabase } from "../lib/supabase";

const DB_NAME = "pinheads-offline-v1";
const DB_VERSION = 1;
const STORES = [
  "meta",
  "players",
  "locations",
  "machines",
  "location_machines",
  "tournament_types",
  "tournaments",
  "tournament_players",
  "tournament_matches",
  "tournament_match_players",
  "queue",
];

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {
            keyPath: storeName === "meta" ? "key" : storeName === "queue" ? "operation_id" : "id",
          });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline storage."));
  });
}

async function transaction(storeNames, mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)]));
    let result;

    try {
      result = work(stores, tx);
    } catch (error) {
      reject(error);
      return;
    }

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error("Offline storage transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("Offline storage transaction aborted."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  return transaction([storeName], "readonly", async (stores) => {
    return requestResult(stores[storeName].getAll());
  });
}

export async function getById(storeName, id) {
  return transaction([storeName], "readonly", async (stores) => {
    return requestResult(stores[storeName].get(id));
  });
}

export async function putMany(storeName, rows) {
  if (!rows?.length) return;
  return transaction([storeName], "readwrite", (stores) => {
    rows.forEach((row) => stores[storeName].put(row));
  });
}

export async function put(storeName, row) {
  return putMany(storeName, [row]);
}

export async function remove(storeName, id) {
  return transaction([storeName], "readwrite", (stores) => {
    stores[storeName].delete(id);
  });
}

export async function setMeta(key, value) {
  return put("meta", { key, value });
}

export async function getMeta(key, fallback = null) {
  const row = await getById("meta", key);
  return row ? row.value : fallback;
}

export function newId() {
  return makeId();
}

export async function cacheReferenceData({ players, locations, machines, locationMachines, tournamentTypes }) {
  await Promise.all([
    putMany("players", players || []),
    putMany("locations", locations || []),
    putMany("machines", machines || []),
    putMany("location_machines", locationMachines || []),
    putMany("tournament_types", tournamentTypes || []),
  ]);
  await setMeta("referenceCachedAt", new Date().toISOString());
}

export async function loadReferenceData() {
  const [players, locations, machines, locationMachines, tournamentTypes] = await Promise.all([
    getAll("players"),
    getAll("locations"),
    getAll("machines"),
    getAll("location_machines"),
    getAll("tournament_types"),
  ]);

  return { players, locations, machines, locationMachines, tournamentTypes };
}

export async function saveTournamentBundle(bundle) {
  const tournament = bundle.tournament;
  if (!tournament?.id) throw new Error("Tournament bundle is missing an id.");

  await Promise.all([
    put("tournaments", tournament),
    putMany("tournament_players", bundle.tournamentPlayers || []),
    putMany("tournament_matches", bundle.matches || []),
    putMany("tournament_match_players", bundle.matchPlayers || []),
  ]);
}

export async function loadTournamentBundle(tournamentId) {
  const tournament = await getById("tournaments", tournamentId);
  if (!tournament) return null;

  const [tournamentPlayers, allMatches, allMatchPlayers, players, machines] = await Promise.all([
    getAll("tournament_players"),
    getAll("tournament_matches"),
    getAll("tournament_match_players"),
    getAll("players"),
    getAll("machines"),
  ]);

  const matches = allMatches
    .filter((match) => match.tournament_id === tournamentId)
    .sort((a, b) => a.round_number - b.round_number || (a.created_at || "").localeCompare(b.created_at || ""));

  const tournamentPlayerRows = tournamentPlayers.filter((row) => row.tournament_id === tournamentId);
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const machineMap = new Map(machines.map((machine) => [machine.id, machine]));

  const hydratedMatches = matches.map((match) => ({
    ...match,
    machines: machineMap.get(match.machine_id) || null,
    tournament_match_players: allMatchPlayers
      .filter((row) => row.match_id === match.id)
      .map((row) => ({ ...row, players: playerMap.get(row.player_id) || null })),
  }));

  return {
    tournament,
    tournamentPlayers: tournamentPlayerRows,
    matches: hydratedMatches,
    matchPlayers: allMatchPlayers.filter((row) => matches.some((match) => match.id === row.match_id)),
  };
}

export async function queueOperation(type, payload, operationId = makeId()) {
  await put("queue", {
    operation_id: operationId,
    type,
    payload,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });
  return operationId;
}

export async function getQueue() {
  const rows = await getAll("queue");
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateQueueItem(item) {
  return put("queue", item);
}

export async function removeQueueItem(operationId) {
  return remove("queue", operationId);
}

export async function clearTournamentLocal(tournamentId) {
  const [players, matches, matchPlayers] = await Promise.all([
    getAll("tournament_players"),
    getAll("tournament_matches"),
    getAll("tournament_match_players"),
  ]);

  await Promise.all([
    remove("tournaments", tournamentId),
    ...players.filter((row) => row.tournament_id === tournamentId).map((row) => remove("tournament_players", row.id)),
    ...matches.filter((row) => row.tournament_id === tournamentId).map((row) => remove("tournament_matches", row.id)),
    ...matchPlayers.filter((row) => matches.some((match) => match.id === row.match_id)).map((row) => remove("tournament_match_players", row.id)),
  ]);
}

export async function refreshReferenceDataFromServer() {
  if (!navigator.onLine) return loadReferenceData();

  const [playersResult, locationsResult, machinesResult, locationMachinesResult, typesResult] = await Promise.all([
    supabase.from("players").select("*").order("created_at", { ascending: true }),
    supabase.from("locations").select("*").order("name", { ascending: true }),
    supabase.from("machines").select("*").order("name", { ascending: true }),
    supabase.from("location_machines").select("*").order("machine_name", { ascending: true }),
    supabase.from("tournament_types").select("*").eq("active", true).order("name", { ascending: true }),
  ]);

  for (const result of [playersResult, locationsResult, machinesResult, locationMachinesResult, typesResult]) {
    if (result.error) throw result.error;
  }

  await cacheReferenceData({
    players: playersResult.data || [],
    locations: locationsResult.data || [],
    machines: machinesResult.data || [],
    locationMachines: locationMachinesResult.data || [],
    tournamentTypes: typesResult.data || [],
  });

  return loadReferenceData();
}

export async function refreshTournamentFromServer(tournamentId) {
  if (!navigator.onLine) return loadTournamentBundle(tournamentId);

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();

  if (tournamentError) throw tournamentError;
  if (!tournament) return null;

  const [tpResult, matchResult] = await Promise.all([
    supabase.from("tournament_players").select("*").eq("tournament_id", tournamentId),
    supabase
      .from("tournament_matches")
      .select("id,tournament_id,round_number,machine_id,status,match_type,version,created_at,machines(id,name),tournament_match_players(id,match_id,player_id,position,points,players(id,first_name))")
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: true }),
  ]);

  if (tpResult.error) throw tpResult.error;
  if (matchResult.error) throw matchResult.error;

  const matchRows = (matchResult.data || []).map((match) => ({
    id: match.id,
    tournament_id: match.tournament_id,
    round_number: match.round_number,
    machine_id: match.machine_id,
    status: match.status,
    match_type: match.match_type || "regular",
    version: match.version ?? 1,
    created_at: match.created_at,
  }));

  const matchPlayers = [];
  for (const match of matchResult.data || []) {
    for (const row of match.tournament_match_players || []) {
      matchPlayers.push(row);
    }
  }

  await saveTournamentBundle({
    tournament,
    tournamentPlayers: tpResult.data || [],
    matches: matchRows,
    matchPlayers,
  });

  return loadTournamentBundle(tournamentId);
}

export async function syncQueue() {
  if (!navigator.onLine) return { synced: 0, pending: (await getQueue()).length };

  const queue = await getQueue();
  let synced = 0;

  for (const item of queue) {
    try {
      let result;

      if (item.type === "tournament_bundle") {
        result = await supabase.rpc("sync_tournament_bundle", {
          p_operation_id: item.operation_id,
          p_payload: item.payload,
        });
      } else if (item.type === "match_result") {
        result = await supabase.rpc("record_match_result", {
          p_operation_id: item.operation_id,
          p_match_id: item.payload.match_id,
          p_winner_player_id: item.payload.winner_player_id,
          p_expected_version: item.payload.expected_version,
        });
      } else if (item.type === "undo_match_result") {
        result = await supabase.rpc("undo_match_result", {
          p_operation_id: item.operation_id,
          p_match_id: item.payload.match_id,
          p_expected_version: item.payload.expected_version,
        });
      } else if (item.type === "tournament_status") {
        result = await supabase.rpc("set_tournament_status", {
          p_operation_id: item.operation_id,
          p_tournament_id: item.payload.tournament_id,
          p_status: item.payload.status,
          p_completed: item.payload.completed,
        });
      } else if (item.type === "delete_tournament") {
        result = await supabase.rpc("delete_tournament", {
          p_operation_id: item.operation_id,
          p_tournament_id: item.payload.tournament_id,
        });
      } else {
        throw new Error(`Unknown offline operation: ${item.type}`);
      }

      if (result?.error) throw result.error;
      await removeQueueItem(item.operation_id);
      synced += 1;
    } catch (error) {
      const nextItem = {
        ...item,
        attempts: Number(item.attempts || 0) + 1,
        last_error: error.message || String(error),
      };
      await updateQueueItem(nextItem);
      console.error("Offline sync failed:", nextItem);
      break;
    }
  }

  if (synced > 0) {
    try {
      await refreshReferenceDataFromServer();
    } catch (error) {
      console.warn("Reference refresh after sync failed:", error);
    }
  }

  return { synced, pending: (await getQueue()).length };
}

export async function startOfflineSync() {
  const run = () => syncQueue().catch((error) => console.error("Offline sync error:", error));
  window.addEventListener("online", run);
  if (navigator.onLine) run();
  return () => window.removeEventListener("online", run);
}

export async function refreshHistoryFromServer() {
  if (!navigator.onLine) {
    return {
      tournaments: await getAll("tournaments"),
      matches: await getAll("tournament_matches"),
      matchPlayers: await getAll("tournament_match_players"),
    };
  }

  const [tournamentsResult, matchesResult, playersResult, machinesResult] = await Promise.all([
    supabase.from("tournaments").select("*").in("status", ["completed", "cancelled_saved"]).order("tournament_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("tournament_matches").select("id,tournament_id,round_number,machine_id,status,match_type,version,created_at").order("round_number", { ascending: true }),
    supabase.from("tournament_match_players").select("id,match_id,player_id,position,points,created_at,players(id,first_name)"),
    supabase.from("machines").select("id,name"),
  ]);

  for (const result of [tournamentsResult, matchesResult, playersResult, machinesResult]) {
    if (result.error) throw result.error;
  }

  await Promise.all([
    putMany("tournaments", tournamentsResult.data || []),
    putMany("tournament_matches", matchesResult.data || []),
    putMany("tournament_match_players", (playersResult.data || []).map((row) => ({ ...row, players: undefined }))),
    putMany("machines", machinesResult.data || []),
    putMany("players", (playersResult.data || []).map((row) => row.players).filter(Boolean)),
  ]);

  return {
    tournaments: tournamentsResult.data || [],
    matches: matchesResult.data || [],
    matchPlayers: playersResult.data || [],
  };
}
