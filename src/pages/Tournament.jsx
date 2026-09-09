import { useEffect, useMemo, useState } from "react";
import { OfflineBanner } from "../lib/offlineStatus";
import {
  cacheReferenceData,
  loadReferenceData,
  newId,
  queueOperation,
  refreshReferenceDataFromServer,
  saveTournamentBundle,
  syncQueue,
} from "../lib/offlineStore";

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function edgeColorRounds(edges) {
  const shuffled = shuffle(edges);
  const rounds = [];

  for (const edge of shuffled) {
    let placed = false;
    for (const round of rounds) {
      const used = new Set();
      round.forEach(([a, b]) => {
        used.add(a);
        used.add(b);
      });
      if (!used.has(edge[0]) && !used.has(edge[1])) {
        round.push(edge);
        placed = true;
        break;
      }
    }
    if (!placed) rounds.push([edge]);
  }

  return shuffle(rounds);
}

function buildOddDegreeEdges(playerIds, degree) {
  const n = playerIds.length;
  const edges = [];
  const seen = new Set();

  for (let distance = 1; distance <= degree / 2; distance += 1) {
    for (let i = 0; i < n; i += 1) {
      const j = (i + distance) % n;
      const a = playerIds[Math.min(i, j)];
      const b = playerIds[Math.max(i, j)];
      const key = `${a}:${b}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }
  }

  return edges;
}

function roundRobinCycle(playerIds) {
  const players = [...playerIds];
  if (players.length % 2 === 1) players.push(null);

  const rounds = [];
  const n = players.length;
  const working = [...players];

  for (let round = 0; round < n - 1; round += 1) {
    const games = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = working[i];
      const b = working[n - 1 - i];
      if (a && b) games.push([a, b]);
    }
    rounds.push(games);

    const fixed = working[0];
    const rotating = working.slice(1);
    rotating.unshift(rotating.pop());
    working.splice(0, working.length, fixed, ...rotating);
  }

  return rounds;
}

export function generateHeadToHeadMatches(playerIds, gamesPerPlayer) {
  const playerCount = playerIds.length;
  const totalSlots = playerCount * gamesPerPlayer;

  if (totalSlots % 2 !== 0) {
    throw new Error("This player/game combination cannot produce an equal number of Head-to-Head games.");
  }

  if (playerCount < 2) throw new Error("At least 2 players are required.");

  const rounds = [];

  if (playerCount === 2) {
    for (let i = 0; i < gamesPerPlayer; i += 1) {
      rounds.push([[playerIds[0], playerIds[1]]]);
    }
  } else if (playerCount % 2 === 0) {
    const cycle = roundRobinCycle(playerIds);
    for (let i = 0; i < gamesPerPlayer; i += 1) {
      rounds.push(shuffle(cycle[i % cycle.length]));
    }
  } else {
    const cycleSize = playerCount - 1;
    const fullCycles = Math.floor(gamesPerPlayer / cycleSize);
    const remainder = gamesPerPlayer % cycleSize;

    for (let cycle = 0; cycle < fullCycles; cycle += 1) {
      const cycleRounds = roundRobinCycle(shuffle(playerIds));
      cycleRounds.forEach((round) => rounds.push(shuffle(round)));
    }

    if (remainder > 0) {
      const edges = buildOddDegreeEdges(shuffle(playerIds), remainder);
      rounds.push(...edgeColorRounds(edges));
    }
  }

  const games = [];
  let gameNumber = 1;
  rounds.forEach((round, roundIndex) => {
    shuffle(round).forEach(([player1, player2]) => {
      games.push({
        gameNumber: gameNumber++,
        roundNumber: roundIndex + 1,
        player1,
        player2,
      });
    });
  });

  const counts = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const opponents = new Set();
  games.forEach((game) => {
    counts[game.player1] += 1;
    counts[game.player2] += 1;
    const pair = [game.player1, game.player2].sort().join(":");
    opponents.add(pair);
  });

  const invalid = playerIds.filter((id) => counts[id] !== gamesPerPlayer);
  if (invalid.length) {
    throw new Error("Schedule generation failed: every player must receive exactly the requested number of games.");
  }

  if (games.length !== totalSlots / 2) {
    throw new Error("Schedule generation failed: incorrect total game count.");
  }

  return games;
}

export default function Tournament() {
  const [players, setPlayers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [machines, setMachines] = useState([]);
  const [tournamentTypes, setTournamentTypes] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [rounds, setRounds] = useState(10);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      let reference;
      if (navigator.onLine) {
        try {
          reference = await refreshReferenceDataFromServer();
        } catch (onlineError) {
          console.warn("Using cached tournament setup:", onlineError);
          reference = await loadReferenceData();
        }
      } else {
        reference = await loadReferenceData();
      }

      setPlayers(reference.players || []);
      setLocations(reference.locations || []);
      setTournamentTypes(reference.tournamentTypes || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load tournament setup.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadLocationMachines(locationId) {
    setSelectedLocation(locationId);
    setSelectedMachines([]);
    setMachines([]);
    if (!locationId) return;
    setLoadingMachines(true);

    try {
      const reference = await loadReferenceData();
      const rows = (reference.locationMachines || []).filter((row) => row.location_id === locationId);
      const names = new Set(rows.map((row) => (row.machine_name || "").trim().toLowerCase()));
      setMachines((reference.machines || []).filter((machine) => names.has((machine.name || "").trim().toLowerCase())));
    } catch (loadError) {
      alert(loadError.message || "Unable to load machines for this location.");
    } finally {
      setLoadingMachines(false);
    }
  }

  function togglePlayer(id) {
    setSelectedPlayers((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleMachine(id) {
    setSelectedMachines((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  const selectedLocationName = useMemo(
    () => locations.find((location) => location.id === selectedLocation)?.name || "",
    [locations, selectedLocation]
  );

  async function createTournament() {
    if (localStorage.getItem("currentTournament")) {
      alert("A tournament is already in progress. Complete or cancel it before starting another tournament.");
      return;
    }
    if (!selectedLocation) return alert("Select a tournament location.");
    if (selectedPlayers.length < 2) return alert("Select at least 2 players.");
    if (!selectedMachines.length) return alert("Select at least 1 machine.");

    const gamesPerPlayer = Number(rounds);
    if (!Number.isInteger(gamesPerPlayer) || gamesPerPlayer < 3 || gamesPerPlayer > 10) {
      return alert("Games per player must be a whole number between 3 and 10.");
    }
    if (selectedPlayers.length % 2 !== 0 && gamesPerPlayer % 2 !== 0) {
      return alert("With an odd number of players, Games Per Player must be an even number.");
    }

    const tournamentType = tournamentTypes.find((type) => type.slug === "head_to_head" && type.active !== false);
    if (!tournamentType) {
      return alert("Connect to the internet once so the Head-to-Head tournament type can be cached on this device.");
    }

    setCreating(true);
    try {
      const matches = generateHeadToHeadMatches(selectedPlayers, gamesPerPlayer);
      const tournamentId = newId();
      const now = new Date().toISOString();
      const tournament = {
        id: tournamentId,
        created_at: now,
        name: name.trim() || `${selectedLocationName || "Pinheads"} Head-to-Head`,
        tournament_date: new Date().toISOString().slice(0, 10),
        scoring_system: "1/0",
        completed: false,
        tournament_type_id: tournamentType.id,
        total_rounds: Math.max(...matches.map((match) => match.roundNumber)),
        games_per_player: gamesPerPlayer,
        status: "active",
        completed_at: null,
        location_id: selectedLocation,
      };

      const tournamentPlayers = selectedPlayers.map((playerId) => ({
        id: newId(),
        tournament_id: tournamentId,
        player_id: playerId,
        created_at: now,
      }));

      const matchRows = matches.map((match) => ({
        id: newId(),
        tournament_id: tournamentId,
        round_number: match.roundNumber,
        machine_id: selectedMachines[(match.gameNumber - 1) % selectedMachines.length],
        status: "pending",
        match_type: "regular",
        version: 1,
        created_at: now,
      }));

      const matchPlayers = [];
      matchRows.forEach((matchRow, index) => {
        const source = matches[index];
        matchPlayers.push(
          { id: newId(), match_id: matchRow.id, player_id: source.player1, position: null, points: 0, created_at: now },
          { id: newId(), match_id: matchRow.id, player_id: source.player2, position: null, points: 0, created_at: now }
        );
      });

      const bundle = { tournament, tournamentPlayers, matches: matchRows, matchPlayers };
      await saveTournamentBundle(bundle);
      await queueOperation("tournament_bundle", bundle);
      localStorage.setItem("currentTournament", JSON.stringify({ id: tournamentId, type: "head_to_head", rounds: gamesPerPlayer, locationId: selectedLocation }));

      if (navigator.onLine) await syncQueue();

      alert(navigator.onLine ? "Head-to-Head tournament created and synced." : "Head-to-Head tournament created on this device. It will sync automatically when you are back online.");
      window.location.reload();
    } catch (createError) {
      console.error("Tournament creation failed:", createError);
      alert(createError.message || "Unable to create tournament.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="page"><h2>Tournament Wizard</h2><p>Loading players and locations...</p></div>;
  if (error) return <div className="page"><h2>Tournament Wizard</h2><OfflineBanner /><p>{error}</p><button className="primary-button" onClick={loadData}>Retry</button></div>;

  return (
    <div className="page">
      <OfflineBanner />
      <h2>Tournament Wizard</h2>
      <h3>Tournament Type</h3>
      <div className="player-card"><strong>Head-to-Head</strong><br /><small>Two players per game. Winner gets 1 point.</small></div>

      <h3>Tournament Name</h3>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`${selectedLocationName || "Pinheads"} Head-to-Head`} />

      <h3>Location</h3>
      {locations.length === 0 ? (
        <div className="player-card"><p>No locations are cached on this device.</p><p>Connect once while online to download your tournament setup.</p></div>
      ) : (
        <div className="player-card">
          <select value={selectedLocation} onChange={(event) => loadLocationMachines(event.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "8px", fontSize: "16px" }}>
            <option value="">Select a location...</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
      )}

      {selectedLocation && <>
        <h3>Machines at Location</h3>
        {loadingMachines ? <div className="player-card"><p>Loading machines...</p></div> : machines.length === 0 ? <div className="player-card"><p>No machines are assigned to this location.</p></div> : <div className="selection-grid">{machines.map((machine) => <button key={machine.id} className={selectedMachines.includes(machine.id) ? "selected-card" : "nav-card"} onClick={() => toggleMachine(machine.id)}>{selectedMachines.includes(machine.id) ? "✅ " : "🎰 "}{machine.name}</button>)}</div>}
      </>}

      <h3>Players</h3>
      {players.length === 0 ? <div className="player-card"><p>No players are cached on this device.</p></div> : <div className="selection-grid">{players.map((player) => <button key={player.id} className={selectedPlayers.includes(player.id) ? "selected-card" : "nav-card"} onClick={() => togglePlayer(player.id)}>{selectedPlayers.includes(player.id) ? "✅ " : ""}{player.first_name}</button>)}</div>}

      <h3>Games Per Player</h3>
      <input type="number" min="3" max="10" step="1" value={rounds} onChange={(event) => setRounds(event.target.value)} />
      <p>Each player will play exactly {rounds} Head-to-Head games.</p>
      {selectedPlayers.length % 2 !== 0 && <p><strong>Odd-player format:</strong> the app will balance byes automatically. A round may contain fewer games, but every player will still receive exactly {rounds} games.</p>}
      <p><strong>Scoring:</strong> Win = 1 point, Loss = 0 points</p>

      <button className="primary-button" onClick={createTournament} disabled={creating || !selectedLocation || !selectedMachines.length || !selectedPlayers.length}>
        {creating ? "Creating Tournament..." : "Create Tournament"}
      </button>
    </div>
  );
}
