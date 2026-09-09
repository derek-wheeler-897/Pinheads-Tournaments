import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export default function PlayerStats() {
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [section, setSection] = useState("stats");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError("");

    try {
      const [playerResult, matchResult, tournamentResult] =
        await Promise.all([
          supabase.from("players").select("id, first_name").order("first_name"),
          supabase
            .from("tournament_matches")
            .select(`
              id,
              tournament_id,
              round_number,
              status,
              machine_id,
              machines ( id, name ),
              tournament_match_players (
                id,
                player_id,
                position,
                points,
                players ( id, first_name )
              )
            `)
            .order("round_number", { ascending: true }),
          supabase
            .from("tournaments")
            .select("id, name, tournament_date, total_rounds, status, created_at")
            .in("status", ["completed", "cancelled_saved"])
            .order("tournament_date", { ascending: false })
            .order("created_at", { ascending: false }),
        ]);

      if (playerResult.error) throw playerResult.error;
      if (matchResult.error) throw matchResult.error;
      if (tournamentResult.error) throw tournamentResult.error;

      const playerRows = playerResult.data || [];
      setPlayers(playerRows);
      setMatches(matchResult.data || []);
      setTournaments(tournamentResult.data || []);

      if (!selectedPlayerId && playerRows.length > 0) {
        setSelectedPlayerId(playerRows[0].id);
      }
    } catch (err) {
      console.error("Unable to load player statistics:", err);
      setError(err.message || "Unable to load player statistics.");
    } finally {
      setLoading(false);
    }
  }

  const tournamentMap = useMemo(
    () => new Map(tournaments.map((tournament) => [tournament.id, tournament])),
    [tournaments]
  );

  const regularCompletedMatches = useMemo(
    () =>
      matches.filter((match) => {
        const tournament = tournamentMap.get(match.tournament_id);
        return (
          match.status === "completed" &&
          tournament &&
          match.round_number <= Number(tournament.total_rounds || 0)
        );
      }),
    [matches, tournamentMap]
  );

  const playoffCompletedMatches = useMemo(
    () =>
      matches.filter((match) => {
        const tournament = tournamentMap.get(match.tournament_id);
        return (
          match.status === "completed" &&
          tournament &&
          match.round_number > Number(tournament.total_rounds || 0)
        );
      }),
    [matches, tournamentMap]
  );

  const stats = useMemo(() => {
    return players.map((player) => {
      const games = regularCompletedMatches.filter((match) =>
        (match.tournament_match_players || []).some(
          (matchPlayer) => matchPlayer.player_id === player.id
        )
      );
      const wins = games.filter((match) =>
        (match.tournament_match_players || []).some(
          (matchPlayer) =>
            matchPlayer.player_id === player.id && Number(matchPlayer.points) === 1
        )
      ).length;
      const losses = games.length - wins;

      return {
        ...player,
        games_played: games.length,
        wins,
        losses,
        total_points: wins,
        win_percentage: games.length
          ? Math.round((wins / games.length) * 1000) / 10
          : 0,
      };
    });
  }, [players, regularCompletedMatches]);

  const selectedStats = stats.find((player) => player.id === selectedPlayerId) || null;

  const headToHead = useMemo(() => {
    if (!selectedPlayerId) return [];

    const records = {};

    regularCompletedMatches.forEach((match) => {
      const gamePlayers = match.tournament_match_players || [];
      const selected = gamePlayers.find((p) => p.player_id === selectedPlayerId);
      if (!selected) return;

      const opponent = gamePlayers.find((p) => p.player_id !== selectedPlayerId);
      if (!opponent) return;

      const key = opponent.player_id;
      if (!records[key]) {
        records[key] = {
          player_id: key,
          player_name: opponent.players?.first_name || "Unknown Player",
          games: 0,
          wins: 0,
          losses: 0,
        };
      }

      records[key].games++;
      if (Number(selected.points) === 1) records[key].wins++;
      else records[key].losses++;
    });

    return Object.values(records).sort((a, b) =>
      a.player_name.localeCompare(b.player_name)
    );
  }, [selectedPlayerId, regularCompletedMatches]);

  function formatDate(dateValue) {
    if (!dateValue) return "No date";
    const date = new Date(`${dateValue}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? dateValue
      : date.toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
  }

  function getTournamentSummary(tournament) {
    const tournamentMatches = matches.filter(
      (match) => match.tournament_id === tournament.id
    );
    const regularMatches = tournamentMatches.filter(
      (match) =>
        match.status === "completed" &&
        match.round_number <= Number(tournament.total_rounds || 0)
    );
    const playoff = tournamentMatches.find(
      (match) =>
        match.status === "completed" &&
        match.round_number > Number(tournament.total_rounds || 0) &&
        match.tournament_match_players?.length === 2
    );

    const totals = {};
    regularMatches.forEach((match) => {
      (match.tournament_match_players || []).forEach((player) => {
        if (!totals[player.player_id]) {
          totals[player.player_id] = {
            player_id: player.player_id,
            name: player.players?.first_name || "Unknown Player",
            points: 0,
          };
        }
        totals[player.player_id].points += Number(player.points || 0);
      });
    });

    const standings = Object.values(totals).sort((a, b) => b.points - a.points);
    let winner = null;

    if (playoff) {
      winner =
        playoff.tournament_match_players?.find(
          (player) => Number(player.points) === 1
        ) || null;
    }

    if (!winner && standings.length) {
      const leaders = standings.filter((player) => player.points === standings[0].points);
      if (leaders.length === 1) winner = leaders[0];
    }

    return { regularMatches, playoff, standings, winner };
  }

  if (loading) {
    return (
      <div className="page">
        <h2>📊 Statistics</h2>
        <p>Loading statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h2>📊 Statistics</h2>
        <p>{error}</p>
        <button className="primary-button" onClick={loadStats}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>📊 Statistics</h2>

      <div className="selection-grid" style={{ marginBottom: "18px" }}>
        <button
          className={section === "stats" ? "selected-card" : "nav-card"}
          onClick={() => setSection("stats")}
        >
          📊 Player Stats
        </button>
        <button
          className={section === "history" ? "selected-card" : "nav-card"}
          onClick={() => setSection("history")}
        >
          🏆 Tournament History
        </button>
      </div>

      {section === "stats" ? (
        <>
          {players.length === 0 ? (
            <div className="player-card">
              <p>No players yet.</p>
            </div>
          ) : (
            <>
              <h3>Player</h3>
              <div className="player-card">
                <select
                  value={selectedPlayerId}
                  onChange={(event) => setSelectedPlayerId(event.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    fontSize: "16px",
                  }}
                >
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.first_name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStats && (
                <div className="player-card">
                  <div style={{ width: "100%" }}>
                    <h3>{selectedStats.first_name}</h3>
                    <p>🎮 Games: {selectedStats.games_played}</p>
                    <p>🏆 Wins: {selectedStats.wins}</p>
                    <p>❌ Losses: {selectedStats.losses}</p>
                    <p>📈 Win %: {selectedStats.win_percentage}%</p>
                    <p>⭐ Tournament Points: {selectedStats.total_points}</p>
                  </div>
                </div>
              )}

              <h3>Head-to-Head Lifetime</h3>
              {headToHead.length === 0 ? (
                <div className="player-card">
                  <p>No completed Head-to-Head games yet.</p>
                </div>
              ) : (
                headToHead.map((record) => (
                  <div className="player-card" key={record.player_id}>
                    <div style={{ width: "100%" }}>
                      <strong>{record.player_name}</strong>
                      <p style={{ margin: "6px 0 0" }}>
                        {record.wins}-{record.losses} ({record.games} games)
                      </p>
                    </div>
                  </div>
                ))
              )}

              <h3>All Players Lifetime</h3>
              <div className="player-card">
                <div style={{ width: "100%" }}>
                  {stats.map((player, index) => (
                    <div
                      key={player.id}
                      style={{
                        padding: "10px 0",
                        borderBottom:
                          index === stats.length - 1
                            ? "none"
                            : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <strong>{player.first_name}</strong>
                      <br />
                      {player.games_played} games · {player.wins}-{player.losses} · {player.win_percentage}%
                    </div>
                  ))}
                </div>
              </div>

              <h3>Playoff Record</h3>
              {selectedStats && (
                <div className="player-card">
                  <div style={{ width: "100%" }}>
                    {(() => {
                      const playoffGames = playoffCompletedMatches.filter((match) =>
                        (match.tournament_match_players || []).some(
                          (player) => player.player_id === selectedStats.id
                        )
                      );
                      const playoffWins = playoffGames.filter((match) =>
                        (match.tournament_match_players || []).some(
                          (player) =>
                            player.player_id === selectedStats.id &&
                            Number(player.points) === 1
                        )
                      ).length;
                      return (
                        <p style={{ margin: 0 }}>
                          {playoffGames.length} playoff games · {playoffWins} wins · {playoffGames.length - playoffWins} losses
                        </p>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {tournaments.length === 0 ? (
            <div className="player-card">
              <h3>No Tournament History Yet</h3>
              <p>Completed tournaments will appear here after they are finalized.</p>
            </div>
          ) : (
            tournaments.map((tournament) => {
              const summary = getTournamentSummary(tournament);
              const isCancelled = tournament.status === "cancelled_saved";
              return (
                <div className="player-card" key={tournament.id} style={{ marginBottom: "16px" }}>
                  <div style={{ width: "100%" }}>
                    <h3>{tournament.name}</h3>
                    <p>📅 {formatDate(tournament.tournament_date)}</p>
                    <p>{isCancelled ? "💾 Cancelled — Completed Games Saved" : "✅ Completed"}</p>
                    <p>🎮 {summary.regularMatches.length} regular game{summary.regularMatches.length === 1 ? "" : "s"}</p>

                    {summary.winner ? (
                      <div style={{ marginTop: "12px", padding: "12px", borderRadius: "8px", background: "rgba(255,255,255,0.06)" }}>
                        <strong>
                          🏆 Champion: {summary.winner.players?.first_name || summary.winner.name || "Unknown Player"}
                        </strong>
                      </div>
                    ) : (
                      <p><strong>No winner recorded</strong></p>
                    )}

                    {summary.standings.length > 0 && (
                      <div style={{ marginTop: "14px" }}>
                        <strong>{isCancelled ? "Standings at Cancellation" : "Final Standings"}</strong>
                        <ol style={{ marginTop: "8px" }}>
                          {summary.standings.map((player) => (
                            <li key={player.player_id} style={{ marginBottom: "4px" }}>
                              {player.name} — {player.points} point{player.points === 1 ? "" : "s"}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {summary.playoff && (
                      <div style={{ marginTop: "14px", padding: "12px", borderRadius: "8px", background: "rgba(255,255,255,0.06)" }}>
                        <strong>🏆 Winner-Take-All Playoff</strong>
                        <p>🎰 {summary.playoff.machines?.name || "Machine not recorded"}</p>
                        <p>
                          {summary.playoff.tournament_match_players?.map((player, index) => (
                            <span key={player.id}>
                              {index ? " vs. " : ""}
                              {player.players?.first_name || "Unknown Player"}
                              {Number(player.points) === 1 ? " 🏆" : ""}
                            </span>
                          ))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
