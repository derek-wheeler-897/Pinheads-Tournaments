import { useEffect, useMemo, useState } from "react";
import { OfflineBanner } from "../lib/offlineStatus";
import { getAll, loadReferenceData, refreshHistoryFromServer } from "../lib/offlineStore";

export default function PlayerStats() {
  const [players, setPlayers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [section, setSection] = useState("stats");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStats() {
    setLoading(true);
    setError("");
    try {
      const reference = await loadReferenceData();
      const history = await refreshHistoryFromServer();
      const localPlayers = reference.players || (await getAll("players"));
      setPlayers(localPlayers);
      setTournaments(history.tournaments || []);
      setMatches(history.matches || []);
      setMatchPlayers(history.matchPlayers || []);
      if (!selectedPlayerId && localPlayers.length) setSelectedPlayerId(localPlayers[0].id);
    } catch (loadError) {
      const [cachedPlayers, cachedTournaments, cachedMatches, cachedMatchPlayers] = await Promise.all([
        getAll("players"), getAll("tournaments"), getAll("tournament_matches"), getAll("tournament_match_players"),
      ]);
      setPlayers(cachedPlayers);
      setTournaments(cachedTournaments.filter((t) => ["completed", "cancelled_saved"].includes(t.status)));
      setMatches(cachedMatches);
      setMatchPlayers(cachedMatchPlayers);
      if (!selectedPlayerId && cachedPlayers.length) setSelectedPlayerId(cachedPlayers[0].id);
      if (!cachedPlayers.length) setError(loadError.message || "No cached statistics are available yet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  const tournamentMap = useMemo(() => new Map(tournaments.map((t) => [t.id, t])), [tournaments]);
  const regularMatches = useMemo(() => matches.filter((m) => (m.match_type || "regular") === "regular" && m.status === "completed" && tournamentMap.has(m.tournament_id)), [matches, tournamentMap]);
  const playoffMatches = useMemo(() => matches.filter((m) => (m.match_type || "regular") === "playoff" && m.status === "completed"), [matches]);
  const mpMap = useMemo(() => {
    const map = new Map();
    matchPlayers.forEach((row) => {
      if (!map.has(row.match_id)) map.set(row.match_id, []);
      map.get(row.match_id).push(row);
    });
    return map;
  }, [matchPlayers]);

  const stats = useMemo(() => {
    const result = new Map(players.map((p) => [p.id, { ...p, games_played: 0, wins: 0, losses: 0, total_points: 0 }]));
    regularMatches.forEach((match) => {
      (mpMap.get(match.id) || []).forEach((row) => {
        const player = result.get(row.player_id);
        if (!player) return;
        player.games_played += 1;
        player.total_points += Number(row.points || 0);
        if (Number(row.points) === 1) player.wins += 1;
        else player.losses += 1;
      });
    });
    return [...result.values()].map((row) => ({ ...row, win_percentage: row.games_played ? Math.round((row.wins / row.games_played) * 1000) / 10 : 0 }));
  }, [players, regularMatches, mpMap]);

  const selectedStats = stats.find((row) => row.id === selectedPlayerId);

  const h2h = useMemo(() => {
    const rows = [];
    regularMatches.forEach((match) => {
      const gamePlayers = mpMap.get(match.id) || [];
      if (gamePlayers.length !== 2) return;
      const mine = gamePlayers.find((row) => row.player_id === selectedPlayerId);
      const other = gamePlayers.find((row) => row.player_id !== selectedPlayerId);
      if (!mine || !other) return;
      const opponent = players.find((p) => p.id === other.player_id);
      rows.push({ opponent: opponent?.first_name || "Unknown", won: Number(mine.points) === 1 });
    });
    const grouped = {};
    rows.forEach((row) => {
      if (!grouped[row.opponent]) grouped[row.opponent] = { opponent: row.opponent, games: 0, wins: 0 };
      grouped[row.opponent].games += 1;
      if (row.won) grouped[row.opponent].wins += 1;
    });
    return Object.values(grouped).map((row) => ({ ...row, losses: row.games - row.wins }));
  }, [regularMatches, mpMap, selectedPlayerId, players]);

  return (
    <div className="page">
      <OfflineBanner />
      <h2>📊 Statistics</h2>
      <div className="selection-grid" style={{ marginBottom: "18px" }}>
        <button className={section === "stats" ? "selected-card" : "nav-card"} onClick={() => setSection("stats")}>📊 Player Stats</button>
        <button className={section === "history" ? "selected-card" : "nav-card"} onClick={() => setSection("history")}>🏆 Tournament History</button>
      </div>

      {loading ? <p>Loading statistics...</p> : error ? <div className="player-card"><p>{error}</p><button className="primary-button" onClick={loadStats}>Retry</button></div> : section === "stats" ? <>
        <h3>Player</h3>
        <div className="player-card"><select value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "8px", fontSize: "16px" }}>{players.map((player) => <option key={player.id} value={player.id}>{player.first_name}</option>)}</select></div>
        {selectedStats && <div className="player-card"><h3>{selectedStats.first_name}</h3><p>🎮 Games: {selectedStats.games_played}</p><p>🏆 Wins: {selectedStats.wins}</p><p>❌ Losses: {selectedStats.losses}</p><p>📈 Win %: {selectedStats.win_percentage}%</p><p>⭐ Tournament Points: {selectedStats.total_points}</p></div>}
        <h3>Head-to-Head</h3>
        {h2h.length ? h2h.map((row) => <div className="player-card" key={row.opponent}><strong>{row.opponent}</strong><p>{row.wins}-{row.losses} · {row.games} games</p></div>) : <div className="player-card"><p>No completed Head-to-Head games yet.</p></div>}
        <h3>All Players</h3>
        {stats.map((row) => <div className="player-card" key={row.id}><strong>{row.first_name}</strong><p>{row.wins}-{row.losses} · {row.win_percentage}% · {row.total_points} points</p></div>)}
        <h3>Playoff Record</h3>
        {playoffMatches.filter((match) => (mpMap.get(match.id) || []).some((row) => row.player_id === selectedPlayerId)).map((match) => <div className="player-card" key={match.id}><strong>{tournamentMap.get(match.tournament_id)?.name || "Tournament"}</strong><p>{(mpMap.get(match.id) || []).map((row) => `${players.find((p) => p.id === row.player_id)?.first_name || "Unknown"}${Number(row.points) === 1 ? " 🏆" : ""}`).join(" vs. ")}</p></div>)}
      </> : <History tournaments={tournaments} matches={matches} matchPlayers={matchPlayers} players={players} />}
    </div>
  );
}

function History({ tournaments, matches, matchPlayers, players }) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  return <>{tournaments.map((tournament) => {
    const regular = matches.filter((m) => m.tournament_id === tournament.id && (m.match_type || "regular") === "regular");
    const playoff = matches.find((m) => m.tournament_id === tournament.id && (m.match_type || "regular") === "playoff");
    const standings = {};
    regular.forEach((match) => (matchPlayers.filter((row) => row.match_id === match.id)).forEach((row) => {
      if (!standings[row.player_id]) standings[row.player_id] = { id: row.player_id, name: playerMap.get(row.player_id)?.first_name || "Unknown", points: 0 };
      if (match.status === "completed") standings[row.player_id].points += Number(row.points || 0);
    }));
    const rows = Object.values(standings).sort((a, b) => b.points - a.points);
    const playoffPlayers = playoff ? matchPlayers.filter((row) => row.match_id === playoff.id) : [];
    const champion = playoffPlayers.find((row) => Number(row.points) === 1)?.player_id || (rows.length && rows[0].points !== rows[1]?.points ? rows[0].id : null);
    return <div className="player-card" key={tournament.id}><h3>{tournament.name}</h3><p>{tournament.tournament_date}</p><p><strong>{tournament.status === "cancelled_saved" ? "Standings at Cancellation" : "Final Standings"}</strong></p><ol>{rows.map((row) => <li key={row.id}>{row.name} — {row.points} points</li>)}</ol>{champion && <p>🏆 Champion: <strong>{playerMap.get(champion)?.first_name || "Unknown"}</strong></p>}{playoff && playoff.status === "completed" && <p>🏆 Playoff: {playoffPlayers.map((row) => `${playerMap.get(row.player_id)?.first_name || "Unknown"}${Number(row.points) === 1 ? " 🏆" : ""}`).join(" vs. ")}</p>}</div>;
  })}</>;
}
