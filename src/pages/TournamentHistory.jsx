import { useEffect, useState } from "react";
import { OfflineBanner } from "../lib/offlineStatus";
import { loadReferenceData, refreshHistoryFromServer } from "../lib/offlineStore";

export default function TournamentHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadHistory() {
    setLoading(true);
    try {
      const [reference, data] = await Promise.all([loadReferenceData(), refreshHistoryFromServer()]);
      const players = new Map(reference.players.map((p) => [p.id, p.first_name]));
      const machines = new Map(reference.machines.map((m) => [m.id, m.name]));
      const matchPlayers = data.matchPlayers || [];
      const rows = (data.tournaments || []).map((tournament) => {
        const tournamentMatches = (data.matches || []).filter((match) => match.tournament_id === tournament.id);
        const regular = tournamentMatches.filter((match) => (match.match_type || "regular") === "regular");
        const playoff = tournamentMatches.find((match) => (match.match_type || "regular") === "playoff");
        const totals = {};
        regular.forEach((match) => matchPlayers.filter((row) => row.match_id === match.id).forEach((row) => {
          if (!totals[row.player_id]) totals[row.player_id] = { player_id: row.player_id, player_name: players.get(row.player_id) || "Unknown Player", points: 0 };
          if (match.status === "completed") totals[row.player_id].points += Number(row.points || 0);
        }));
        const standings = Object.values(totals).sort((a, b) => b.points - a.points);
        const playoffRows = playoff ? matchPlayers.filter((row) => row.match_id === playoff.id) : [];
        const playoffWinner = playoffRows.find((row) => Number(row.points) === 1);
        const leader = standings[0];
        const winner = playoffWinner ? players.get(playoffWinner.player_id) : standings.length === 1 || standings[0]?.points !== standings[1]?.points ? leader?.player_name : null;
        return { tournament, standings, playoff, playoffRows, winner, machineName: playoff ? machines.get(playoff.machine_id) : null };
      });
      setHistory(rows);
    } catch (loadError) {
      setError(loadError.message || "Unable to load tournament history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);

  return <div className="page"><OfflineBanner /><h2>🏆 Tournament History</h2>{loading ? <p>Loading tournament history...</p> : error ? <div className="player-card"><p>{error}</p><button className="primary-button" onClick={loadHistory}>Retry</button></div> : history.length === 0 ? <div className="player-card"><p>No completed tournaments yet.</p></div> : history.map(({ tournament, standings, playoff, playoffRows, winner, machineName }) => <div className="player-card" key={tournament.id}><h3>{tournament.name}</h3><p>{tournament.tournament_date}</p><p><strong>{tournament.status === "cancelled_saved" ? "Standings at Cancellation" : "Final Standings"}</strong></p><ol>{standings.map((row) => <li key={row.player_id}>{row.player_name} — {row.points} point{row.points === 1 ? "" : "s"}</li>)}</ol>{winner ? <p>🏆 Winner: <strong>{winner}</strong></p> : <p>No winner recorded.</p>}{playoff?.status === "completed" && <div style={{ marginTop: "12px" }}><strong>🏆 Winner-Take-All Playoff</strong><p>🎰 {machineName || "Machine not recorded"}</p><p>{playoffRows.map((row, index) => `${index ? " vs. " : ""}${row.player_id ? (history.find((x) => x.tournament.id === tournament.id)?.standings.find((s) => s.player_id === row.player_id)?.player_name || "Unknown") : "Unknown"}${Number(row.points) === 1 ? " 🏆" : ""}`).join("")}</p></div>}</div>)}</div>;
}
