import { useEffect, useMemo, useState } from "react";
import { OfflineBanner } from "../lib/offlineStatus";
import {
  clearTournamentLocal,
  getById,
  loadTournamentBundle,
  newId,
  queueOperation,
  refreshTournamentFromServer,
  saveTournamentBundle,
  syncQueue,
} from "../lib/offlineStore";

function hydrateMatches(bundle) {
  return bundle?.matches || [];
}

export default function CurrentTournament() {
  const [tournament, setTournament] = useState(null);
  const [matches, setMatches] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [showCancelOptions, setShowCancelOptions] = useState(false);
  const [playoffStarting, setPlayoffStarting] = useState(false);
  const [error, setError] = useState("");

  async function applyBundle(bundle) {
    if (!bundle?.tournament) return false;
    setTournament(bundle.tournament);
    setMatches(hydrateMatches(bundle));

    const rounds = [...new Set((bundle.matches || []).map((match) => Number(match.round_number)))].sort((a, b) => a - b);
    const unfinished = rounds.find((round) => (bundle.matches || []).filter((match) => Number(match.round_number) === round).some((match) => match.status !== "completed"));
    setCurrentRound(unfinished || rounds[rounds.length - 1] || 1);
    return true;
  }

  async function loadTournament() {
    setLoading(true);
    setError("");
    try {
      const saved = JSON.parse(localStorage.getItem("currentTournament") || "null");
      if (!saved?.id) throw new Error("No active tournament found.");

      let bundle = await loadTournamentBundle(saved.id);
      if (bundle) await applyBundle(bundle);

      if (navigator.onLine) {
        try {
          await syncQueue();
          const fresh = await refreshTournamentFromServer(saved.id);
          if (fresh) await applyBundle(fresh);
        } catch (onlineError) {
          if (!bundle) throw onlineError;
          console.warn("Using local tournament data while offline/syncing:", onlineError);
        }
      }

      if (!bundle && !navigator.onLine) {
        throw new Error("This tournament is not cached on this device. Connect to the internet once to download it.");
      }
    } catch (loadError) {
      setError(loadError.message || "Unable to load tournament.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTournament();
  }, []);

  const roundNumbers = useMemo(
    () => [...new Set(matches.map((match) => Number(match.round_number)))].sort((a, b) => a - b),
    [matches]
  );

  const regularRounds = useMemo(
    () => roundNumbers.filter((round) => matches.some((match) => Number(match.round_number) === round && (match.match_type || "regular") === "regular")),
    [matches, roundNumbers]
  );

  function getRoundMatches(round) {
    return matches.filter((match) => Number(match.round_number) === Number(round));
  }

  function getWinner(match) {
    return (match.tournament_match_players || []).find((player) => Number(player.points) === 1) || null;
  }

  function getRegularStandings() {
    const standings = {};
    matches.filter((match) => (match.match_type || "regular") === "regular").forEach((match) => {
      (match.tournament_match_players || []).forEach((row) => {
        if (!standings[row.player_id]) {
          standings[row.player_id] = {
            player_id: row.player_id,
            player_name: row.players?.first_name || "Unknown Player",
            points: 0,
            games: 0,
          };
        }
        if (match.status === "completed") {
          standings[row.player_id].points += Number(row.points || 0);
          standings[row.player_id].games += 1;
        }
      });
    });
    return Object.values(standings).sort((a, b) => b.points - a.points || a.player_name.localeCompare(b.player_name));
  }

  function getFinalTieLeaders() {
    const standings = getRegularStandings();
    if (!standings.length) return [];
    return standings.filter((player) => player.points === standings[0].points);
  }

  function getPlayoffMatch() {
    return matches.find((match) => (match.match_type || "regular") === "playoff") || null;
  }

  function getChampion() {
    const playoff = getPlayoffMatch();
    if (playoff?.status === "completed") return getWinner(playoff);
    const leaders = getFinalTieLeaders();
    return leaders.length === 1 ? leaders[0] : null;
  }

  async function persistLocal(nextMatches = matches, nextTournament = tournament) {
    const matchPlayers = nextMatches.flatMap((match) =>
      (match.tournament_match_players || []).map((row) => ({
        id: row.id,
        match_id: row.match_id || match.id,
        player_id: row.player_id,
        position: row.position ?? null,
        points: Number(row.points || 0),
        created_at: row.created_at || new Date().toISOString(),
      }))
    );

    await saveTournamentBundle({
      tournament: nextTournament,
      tournamentPlayers: [],
      matches: nextMatches.map((match) => ({
        id: match.id,
        tournament_id: match.tournament_id,
        round_number: Number(match.round_number),
        machine_id: match.machine_id || null,
        status: match.status,
        match_type: match.match_type || "regular",
        version: Number(match.version || 1),
        created_at: match.created_at || new Date().toISOString(),
      })),
      matchPlayers,
    });
  }

  async function selectWinner(match, winnerPlayerId) {
    if (saving) return;
    const players = match.tournament_match_players || [];
    if (players.length !== 2) return alert("This game does not have exactly two players.");

    const winner = players.find((row) => row.player_id === winnerPlayerId);
    const loser = players.find((row) => row.player_id !== winnerPlayerId);
    if (!winner || !loser) return alert("Unable to identify both players.");

    const expectedVersion = Number(match.version || 1);
    const nextVersion = expectedVersion + 1;
    const updatedMatches = matches.map((row) => row.id !== match.id ? row : {
      ...row,
      status: "completed",
      version: nextVersion,
      tournament_match_players: row.tournament_match_players.map((player) => ({
        ...player,
        points: player.player_id === winnerPlayerId ? 1 : 0,
        position: player.player_id === winnerPlayerId ? 1 : 2,
      })),
    });

    setSaving(true);
    try {
      setMatches(updatedMatches);
      await persistLocal(updatedMatches);
      await queueOperation("match_result", {
        match_id: match.id,
        winner_player_id: winnerPlayerId,
        expected_version: expectedVersion,
      });
      setEditingMatchId(null);
      if (navigator.onLine) await syncQueue();
    } catch (error) {
      setMatches(matches);
      alert(error.message || "Unable to save the result locally.");
    } finally {
      setSaving(false);
    }
  }

  async function undoResult(match) {
    if (saving) return;
    if (match.status !== "completed") return;
    if (!window.confirm("Undo this game result and return the game to pending?")) return;

    const expectedVersion = Number(match.version || 1);
    const updatedMatches = matches.map((row) => row.id !== match.id ? row : {
      ...row,
      status: "pending",
      version: expectedVersion + 1,
      tournament_match_players: row.tournament_match_players.map((player) => ({ ...player, points: 0, position: null })),
    });

    setSaving(true);
    try {
      setMatches(updatedMatches);
      await persistLocal(updatedMatches);
      await queueOperation("undo_match_result", { match_id: match.id, expected_version: expectedVersion });
      setEditingMatchId(null);
      if (navigator.onLine) await syncQueue();
    } catch (error) {
      setMatches(matches);
      alert(error.message || "Unable to undo this result.");
    } finally {
      setSaving(false);
    }
  }

  async function startWinnerTakeAllPlayoff() {
    if (saving || playoffStarting) return;
    const leaders = getFinalTieLeaders();
    if (leaders.length !== 2) return alert(leaders.length > 2 ? "There are 3 or more players tied for first. A multi-player playoff format is required." : "There is no two-player tie to resolve.");
    if (getPlayoffMatch()) return setCurrentRound(getPlayoffMatch().round_number);

    setPlayoffStarting(true);
    try {
      const regularMachineIds = [...new Set(matches.filter((match) => (match.match_type || "regular") === "regular").map((match) => match.machine_id).filter(Boolean))];
      if (!regularMachineIds.length) throw new Error("No tournament machines are available for the playoff.");
      const machineId = regularMachineIds[Math.floor(Math.random() * regularMachineIds.length)];
      const roundNumber = Math.max(...regularRounds, 0) + 1;
      const now = new Date().toISOString();
      const playoff = {
        id: newId(),
        tournament_id: tournament.id,
        round_number: roundNumber,
        machine_id: machineId,
        status: "pending",
        match_type: "playoff",
        version: 1,
        created_at: now,
        tournament_match_players: leaders.map((leader) => ({
          id: newId(),
          match_id: "",
          player_id: leader.player_id,
          position: null,
          points: 0,
          created_at: now,
          players: { id: leader.player_id, first_name: leader.player_name },
        })),
      };
      playoff.tournament_match_players = playoff.tournament_match_players.map((row) => ({ ...row, match_id: playoff.id }));
      const updatedMatches = [...matches, playoff];
      setMatches(updatedMatches);
      await persistLocal(updatedMatches);
      await queueOperation("tournament_bundle", {
        tournament,
        tournament_players: [],
        matches: updatedMatches.map((match) => ({
          id: match.id,
          tournament_id: match.tournament_id,
          round_number: match.round_number,
          machine_id: match.machine_id,
          status: match.status,
          match_type: match.match_type || "regular",
          version: match.version || 1,
          created_at: match.created_at,
        })),
        match_players: updatedMatches.flatMap((match) => (match.tournament_match_players || []).map((row) => ({
          id: row.id,
          match_id: match.id,
          player_id: row.player_id,
          position: row.position,
          points: row.points,
          created_at: row.created_at,
        }))),
      });
      setCurrentRound(roundNumber);
      if (navigator.onLine) await syncQueue();
    } catch (error) {
      alert(error.message || "Unable to start the playoff.");
    } finally {
      setPlayoffStarting(false);
    }
  }

  async function finishTournament(status = "completed") {
    if (saving) return;
    const regularFinal = regularRounds[regularRounds.length - 1];
    const finalGames = getRoundMatches(regularFinal);
    const allRegularComplete = finalGames.length > 0 && finalGames.every((match) => match.status === "completed");
    const leaders = getFinalTieLeaders();
    const playoff = getPlayoffMatch();

    if (status === "completed") {
      if (!allRegularComplete) return alert("Complete every regular game before finalizing the tournament.");
      if (leaders.length > 2) return alert("There are 3 or more players tied for first. The tournament cannot be finalized until a multi-player playoff format is implemented.");
      if (leaders.length === 2 && (!playoff || playoff.status !== "completed")) return alert("There is a tie for first. Complete the winner-take-all playoff before finalizing the tournament.");
    }

    setSaving(true);
    try {
      const nextTournament = {
        ...tournament,
        status,
        completed: status === "completed",
        completed_at: new Date().toISOString(),
      };
      setTournament(nextTournament);
      await persistLocal(matches, nextTournament);
      await queueOperation("tournament_status", {
        tournament_id: tournament.id,
        status,
        completed: status === "completed",
      });
      if (navigator.onLine) await syncQueue();
      localStorage.removeItem("currentTournament");
      alert(status === "completed" ? "Tournament complete. Results are saved locally and will sync automatically." : "Tournament cancelled. Completed games were preserved locally and will sync automatically.");
      window.location.reload();
    } catch (error) {
      alert(error.message || "Unable to update tournament status.");
    } finally {
      setSaving(false);
    }
  }

  async function discardTournament() {
    if (saving) return;
    if (!window.confirm("Discard this tournament and all of its games? This cannot be undone.")) return;
    setSaving(true);
    try {
      await queueOperation("delete_tournament", { tournament_id: tournament.id });
      await clearTournamentLocal(tournament.id);
      localStorage.removeItem("currentTournament");
      if (navigator.onLine) await syncQueue();
      alert("Tournament discarded.");
      window.location.reload();
    } catch (error) {
      alert(error.message || "Unable to discard the tournament.");
    } finally {
      setSaving(false);
      setShowCancelOptions(false);
    }
  }

  if (loading) return <div className="page"><h2>Current Tournament</h2><p>Loading tournament...</p></div>;
  if (error) return <div className="page"><h2>Current Tournament</h2><OfflineBanner /><p>{error}</p><button className="primary-button" onClick={loadTournament}>Retry</button></div>;
  if (!tournament || !matches.length) return <div className="page"><h2>Current Tournament</h2><p>No tournament games found.</p></div>;

  const roundMatches = getRoundMatches(currentRound);
  const isPlayoffRound = roundMatches.some((match) => (match.match_type || "regular") === "playoff");
  const allCurrentRoundCompleted = roundMatches.length > 0 && roundMatches.every((match) => match.status === "completed");
  const finalRound = regularRounds[regularRounds.length - 1];
  const leaders = getFinalTieLeaders();
  const hasTwoPlayerTie = !isPlayoffRound && currentRound === finalRound && allCurrentRoundCompleted && leaders.length === 2;
  const hasMultiPlayerTie = !isPlayoffRound && currentRound === finalRound && allCurrentRoundCompleted && leaders.length > 2;
  const playoff = getPlayoffMatch();
  const tournamentComplete = isPlayoffRound ? allCurrentRoundCompleted : currentRound === finalRound && allCurrentRoundCompleted && leaders.length === 1;
  const champion = getChampion();

  return (
    <div className="page">
      <OfflineBanner />
      <h2>🏆 {tournament.name}</h2>
      <div className="player-card">
        <strong>{isPlayoffRound ? "🏆 Winner-Take-All Playoff" : `Round ${currentRound} of ${finalRound}`}</strong>
        {!isPlayoffRound && <><br /><small>{tournament.games_per_player || "?"} games per player</small></>}
      </div>

      <h3>{isPlayoffRound ? "🏆 Winner-Take-All Playoff" : `Round ${currentRound}`}</h3>
      {roundMatches.map((match, index) => {
        const winner = getWinner(match);
        const editing = editingMatchId === match.id;
        const machineName = match.machines?.name || match.machine_name || "Machine not recorded";
        return (
          <div className="player-card" key={match.id}>
            <div style={{ width: "100%" }}>
              <strong>{isPlayoffRound ? "Playoff" : `Game ${index + 1}`}</strong><br />
              🎰 {machineName}<br /><br />
              {(match.tournament_match_players || []).map((player, playerIndex) => {
                const selected = winner?.player_id === player.player_id;
                return <button key={player.id} className={selected && !editing ? "winner-button" : "nav-card"} style={{ width: "100%", marginTop: playerIndex ? "8px" : 0 }} disabled={saving} onClick={() => selectWinner(match, player.player_id)}>{selected && !editing ? "🏆 " : ""}{player.players?.first_name || player.player_name || "Unknown Player"}{selected && !editing ? " — WINNER" : ""}</button>;
              })}
              {match.status === "completed" && !editing && <><p><strong>Game Complete</strong></p><button className="nav-card" style={{ width: "100%" }} disabled={saving} onClick={() => setEditingMatchId(match.id)}>✏️ Edit Result</button><button className="nav-card" style={{ width: "100%", marginTop: "8px" }} disabled={saving} onClick={() => undoResult(match)}>↩️ Undo Result</button></>}
              {editing && <p><strong>Select the correct winner:</strong></p>}
            </div>
          </div>
        );
      })}

      {!isPlayoffRound && currentRound < finalRound && <button className="primary-button" disabled={!allCurrentRoundCompleted || saving || editingMatchId !== null} onClick={() => setCurrentRound(currentRound + 1)}>Proceed to Round {currentRound + 1} →</button>}

      {hasTwoPlayerTie && <div className="player-card"><h3>🏆 Tie for First!</h3><p>{leaders[0].player_name} and {leaders[1].player_name} are tied with {leaders[0].points} points.</p><p>Play one winner-take-all Head-to-Head game to determine the champion.</p><button className="primary-button" style={{ width: "100%" }} disabled={saving || playoffStarting} onClick={startWinnerTakeAllPlayoff}>{playoffStarting ? "Starting Playoff..." : "🏆 Start Winner-Take-All Playoff"}</button></div>}

      {hasMultiPlayerTie && <div className="player-card"><h3>⚠️ Tie for First</h3><p>{leaders.length} players are tied for first.</p><p>A multi-player playoff format is required before this tournament can be finalized.</p></div>}

      {tournamentComplete && <div className="player-card"><h3>🏆 Tournament Complete!</h3>{champion && <p>Champion: <strong>{champion.players?.first_name || champion.player_name || "Unknown Player"}</strong></p>}{playoff?.status === "completed" && <p>Playoff is recorded separately and does not add a point to the regular standings.</p>}<button className="primary-button" style={{ width: "100%" }} disabled={saving} onClick={() => finishTournament("completed")}>{saving ? "Saving..." : "🏆 Complete Tournament"}</button></div>}

      {!showCancelOptions && <button className="nav-card" style={{ width: "100%", marginTop: "16px" }} disabled={saving} onClick={() => setShowCancelOptions(true)}>✕ Cancel Tournament</button>}
      {showCancelOptions && <div className="player-card"><h3>Cancel Tournament?</h3><p>Completed games can be preserved in history.</p><button className="primary-button" style={{ width: "100%", marginBottom: "10px" }} disabled={saving} onClick={() => finishTournament("cancelled_saved")}>💾 Save Completed Games</button><button className="nav-card" style={{ width: "100%", marginBottom: "10px" }} disabled={saving} onClick={discardTournament}>🗑️ Discard Tournament</button><button className="nav-card" style={{ width: "100%" }} onClick={() => setShowCancelOptions(false)}>← Keep Tournament</button></div>}
    </div>
  );
}
