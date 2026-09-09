import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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

  useEffect(() => {
    loadTournament();
  }, []);

  async function loadTournament() {
    setLoading(true);
    setError("");

    try {
      const savedTournament = JSON.parse(
        localStorage.getItem("currentTournament")
      );

      if (!savedTournament?.id) {
        throw new Error("No active tournament found.");
      }

      const { data: tournamentRows, error: tournamentError } =
        await supabase
          .from("tournaments")
          .select("*")
          .eq("id", savedTournament.id);

      if (tournamentError) {
        throw tournamentError;
      }

      if (!tournamentRows || tournamentRows.length !== 1) {
        throw new Error(
          `Expected exactly 1 tournament, but found ${
            tournamentRows?.length || 0
          }.`
        );
      }

      const tournamentRow = tournamentRows[0];

      const { data: matchData, error: matchError } =
        await supabase
          .from("tournament_matches")
          .select(`
            id,
            round_number,
            status,
            machine_id,
            machines (
              id,
              name
            ),
            tournament_match_players (
              id,
              player_id,
              position,
              points,
              players (
                id,
                first_name
              )
            )
          `)
          .eq("tournament_id", savedTournament.id)
          .order("round_number", {
            ascending: true,
          });

      if (matchError) {
        throw matchError;
      }

      setTournament(tournamentRow);
      setMatches(matchData || []);

      const groupedRounds = {};

      (matchData || []).forEach((match) => {
        if (!groupedRounds[match.round_number]) {
          groupedRounds[match.round_number] = [];
        }

        groupedRounds[match.round_number].push(match);
      });

      const roundNumbers = Object.keys(groupedRounds)
        .map(Number)
        .sort((a, b) => a - b);

      const unfinishedRound = roundNumbers.find(
        (roundNumber) =>
          groupedRounds[roundNumber].some(
            (match) => match.status !== "completed"
          )
      );

      if (unfinishedRound) {
        setCurrentRound(unfinishedRound);
      } else if (roundNumbers.length > 0) {
        setCurrentRound(
          roundNumbers[roundNumbers.length - 1]
        );
      }
    } catch (err) {
      console.error("Unable to load tournament:", err);

      setError(
        err.message || "Unable to load tournament."
      );
    } finally {
      setLoading(false);
    }
  }

  function getRoundMatches(roundNumber) {
    return matches.filter(
      (match) => match.round_number === roundNumber
    );
  }

  function isMatchCompleted(match) {
    return match.status === "completed";
  }

  function getWinner(match) {
    const players =
      match.tournament_match_players || [];

    return players.find(
      (player) => player.points === 1
    );
  }

  function startEditing(matchId) {
    setEditingMatchId(matchId);
  }

  async function selectWinner(match, winnerPlayerId) {
    if (saving) {
      return;
    }

    const matchPlayers =
      match.tournament_match_players || [];

    if (matchPlayers.length !== 2) {
      alert(
        "This game does not have exactly two players."
      );
      return;
    }

    const winner = matchPlayers.find(
      (player) => player.player_id === winnerPlayerId
    );

    if (!winner) {
      alert("Unable to find the selected winner.");
      return;
    }

    const loser = matchPlayers.find(
      (player) => player.player_id !== winnerPlayerId
    );

    if (!loser) {
      alert("Unable to find the losing player.");
      return;
    }

    setSaving(true);

    try {
      const { error: winnerError } = await supabase
        .from("tournament_match_players")
        .update({
          points: 1,
          position: 1,
        })
        .eq("id", winner.id);

      if (winnerError) {
        throw winnerError;
      }

      const { error: loserError } = await supabase
        .from("tournament_match_players")
        .update({
          points: 0,
          position: 2,
        })
        .eq("id", loser.id);

      if (loserError) {
        throw loserError;
      }

      const { error: matchError } = await supabase
        .from("tournament_matches")
        .update({
          status: "completed",
        })
        .eq("id", match.id);

      if (matchError) {
        throw matchError;
      }

      setMatches((previousMatches) =>
        previousMatches.map((existingMatch) => {
          if (existingMatch.id !== match.id) {
            return existingMatch;
          }

          return {
            ...existingMatch,
            status: "completed",
            tournament_match_players:
              existingMatch.tournament_match_players.map(
                (matchPlayer) => ({
                  ...matchPlayer,
                  points:
                    matchPlayer.player_id ===
                    winnerPlayerId
                      ? 1
                      : 0,
                  position:
                    matchPlayer.player_id ===
                    winnerPlayerId
                      ? 1
                      : 2,
                })
              ),
          };
        })
      );

      setEditingMatchId(null);
    } catch (err) {
      console.error(
        "Unable to record game result:",
        err
      );

      alert(
        err.message ||
          "Unable to record the game result."
      );
    } finally {
      setSaving(false);
    }
  }

  function proceedToNextRound() {
  const currentMatches =
    getRoundMatches(currentRound);

  const allCompleted = currentMatches.every(
    (match) => match.status === "completed"
  );

  if (!allCompleted) {
    alert(
      "Complete every game in this round before proceeding."
    );
    return;
  }

  const lastRound =
    Math.max(
      ...matches.map((match) => match.round_number)
    );

  // Do not advance beyond the final round.
  if (currentRound >= lastRound) {
    return;
  }

  setCurrentRound(currentRound + 1);
}

  function getTournamentStandings() {
    const standings = {};

    matches.forEach((match) => {
      (match.tournament_match_players || []).forEach((matchPlayer) => {
        const playerId = matchPlayer.player_id;

        if (!standings[playerId]) {
          standings[playerId] = {
            player_id: playerId,
            player_name:
              matchPlayer.players?.first_name ||
              "Unknown Player",
            points: 0,
          };
        }

        if (match.status === "completed") {
          standings[playerId].points +=
            Number(matchPlayer.points || 0);
        }
      });
    });

    return Object.values(standings).sort(
      (a, b) => b.points - a.points
    );
  }

  function getFinalStandings() {
    return getTournamentStandings().filter(
      (player) =>
        matches.some((match) =>
          (match.tournament_match_players || []).some(
            (matchPlayer) =>
              matchPlayer.player_id === player.player_id
          )
        )
    );
  }

  function getFinalTieLeaders() {
    const baseRoundLimit = Number(
      tournament?.total_rounds || 0
    );

    const standings = {};

    matches
      .filter(
        (match) => match.round_number <= baseRoundLimit
      )
      .forEach((match) => {
        (match.tournament_match_players || []).forEach(
          (matchPlayer) => {
            if (!standings[matchPlayer.player_id]) {
              standings[matchPlayer.player_id] = {
                player_id: matchPlayer.player_id,
                player_name:
                  matchPlayer.players?.first_name ||
                  "Unknown Player",
                points: 0,
              };
            }

            if (match.status === "completed") {
              standings[matchPlayer.player_id].points +=
                Number(matchPlayer.points || 0);
            }
          }
        );
      });

    const rows = Object.values(standings).sort(
      (a, b) => b.points - a.points
    );

    if (rows.length === 0) {
      return [];
    }

    const topPoints = rows[0].points;

    return rows.filter(
      (player) => player.points === topPoints
    );
  }

  function getPlayoffMatch() {
    if (!matches.length) {
      return null;
    }

    const highestRound = Math.max(
      ...matches.map((match) => match.round_number)
    );

    const possiblePlayoff = matches.find(
      (match) =>
        match.round_number > highestRound - 1 &&
        match.tournament_match_players?.length === 2 &&
        match.status !== undefined
    );

    return possiblePlayoff || null;
  }

  function getOverallChampion() {
    const standings = getTournamentStandings();

    if (standings.length === 0) {
      return null;
    }

    return standings[0];
  }

  async function startWinnerTakeAllPlayoff() {
    if (saving || playoffStarting) {
      return;
    }

    const leaders = getFinalTieLeaders();

    if (leaders.length !== 2) {
      alert(
        leaders.length > 2
          ? "There are 3 or more players tied for first. A multi-player playoff format is required."
          : "There is no two-player tie to resolve."
      );
      return;
    }

    const existingPlayoff = matches.find(
      (match) =>
        match.round_number > currentRound &&
        match.tournament_match_players?.length === 2
    );

    if (existingPlayoff) {
      setCurrentRound(existingPlayoff.round_number);
      return;
    }

    setPlayoffStarting(true);

    try {
      const { data: locationMachineRows, error: locationMachineError } =
        await supabase
          .from("location_machines")
          .select("machine_name")
          .eq("location_id", tournament.location_id);

      if (locationMachineError) {
        throw locationMachineError;
      }

      const machineNames = (locationMachineRows || [])
        .map((row) => (row.machine_name || "").trim())
        .filter(Boolean);

      let selectedMachineId = null;

      if (machineNames.length > 0) {
        const { data: allMachines, error: machinesError } =
          await supabase
            .from("machines")
            .select("id,name");

        if (machinesError) {
          throw machinesError;
        }

        const normalizedNames = new Set(
          machineNames.map((name) => name.toLowerCase())
        );

        const availableMachines = (allMachines || []).filter(
          (machine) =>
            normalizedNames.has(
              (machine.name || "").trim().toLowerCase()
            )
        );

        if (availableMachines.length > 0) {
          selectedMachineId =
            availableMachines[
              Math.floor(
                Math.random() * availableMachines.length
              )
            ].id;
        }
      }

      const nextRound =
        Math.max(
          ...matches.map((match) => match.round_number)
        ) + 1;

      const { data: playoffMatch, error: playoffMatchError } =
        await supabase
          .from("tournament_matches")
          .insert({
            tournament_id: tournament.id,
            round_number: nextRound,
            machine_id: selectedMachineId,
            status: "pending",
          })
          .select()
          .single();

      if (playoffMatchError) {
        throw playoffMatchError;
      }

      const playoffPlayers = leaders.map((leader) => ({
        match_id: playoffMatch.id,
        player_id: leader.player_id,
        position: null,
        points: 0,
      }));

      const { data: insertedPlayers, error: playoffPlayersError } =
        await supabase
          .from("tournament_match_players")
          .insert(playoffPlayers)
          .select(`
            id,
            player_id,
            position,
            points,
            players (
              id,
              first_name
            )
          `);

      if (playoffPlayersError) {
        throw playoffPlayersError;
      }

      let playoffMachine = null;

      if (selectedMachineId) {
        const { data: machineRow } = await supabase
          .from("machines")
          .select("id,name")
          .eq("id", selectedMachineId)
          .single();

        playoffMachine = machineRow || null;
      }

      const playoffWithPlayers = {
        ...playoffMatch,
        machines: playoffMachine,
        tournament_match_players:
          insertedPlayers || [],
      };

      setMatches((previousMatches) => [
        ...previousMatches,
        playoffWithPlayers,
      ]);

      setCurrentRound(nextRound);

      alert(
        "Winner-take-all playoff created! Select the winner to determine the tournament champion."
      );
    } catch (err) {
      console.error(
        "Unable to start winner-take-all playoff:",
        err
      );

      alert(
        err.message ||
          "Unable to start the winner-take-all playoff."
      );
    } finally {
      setPlayoffStarting(false);
    }
  }

  async function completeTournament() {
    if (saving) {
      return;
    }

    const allCompleted = matches.every(
      (match) => match.status === "completed"
    );

    if (!allCompleted) {
      alert(
        "Every game must be completed before the tournament can be finalized."
      );
      return;
    }

    const leaders = getFinalTieLeaders();
    const playoffRoundExists = matches.some(
      (match) =>
        match.round_number > Number(tournament.total_rounds || 0) &&
        match.tournament_match_players?.length === 2
    );

    if (!playoffRoundExists && leaders.length > 2) {
      alert(
        "There are 3 or more players tied for first. The tournament cannot be finalized until a multi-player playoff format is implemented."
      );
      return;
    }

    if (!playoffRoundExists && leaders.length === 2) {
      const hasPlayoff = matches.some(
        (match) =>
          match.round_number > currentRound &&
          match.tournament_match_players?.length === 2
      );

      if (!hasPlayoff) {
        alert(
          "There is a tie for first. Start the winner-take-all playoff before completing the tournament."
        );
        return;
      }

      const playoffRoundNumber = Math.max(
        ...matches.map((item) => item.round_number)
      );

      const playoffMatch = matches.find(
        (match) =>
          match.round_number === playoffRoundNumber &&
          match.tournament_match_players?.length === 2
      );

      if (
        !playoffMatch ||
        playoffMatch.status !== "completed"
      ) {
        alert(
          "Complete the winner-take-all playoff before finalizing the tournament."
        );
        return;
      }
    }

    const confirmed = window.confirm(
      "Complete this tournament?\n\nAll game results will be permanently saved as tournament history and will count toward player statistics."
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);

    try {
      const { error: tournamentError } = await supabase
        .from("tournaments")
        .update({
          status: "completed",
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", tournament.id);

      if (tournamentError) {
        throw tournamentError;
      }

      localStorage.removeItem("currentTournament");

      alert(
        "Tournament complete! All results have been saved to tournament history."
      );

      window.location.reload();
    } catch (err) {
      console.error(
        "Unable to complete tournament:",
        err
      );

      alert(
        err.message ||
          "Unable to complete the tournament."
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelTournament(saveCompletedGames) {
    if (saving) {
      return;
    }

    setSaving(true);

    try {
      if (saveCompletedGames) {
        const { error: tournamentError } = await supabase
          .from("tournaments")
          .update({
            status: "cancelled_saved",
            completed: false,
            completed_at: new Date().toISOString(),
          })
          .eq("id", tournament.id);

        if (tournamentError) {
          throw tournamentError;
        }

        localStorage.removeItem("currentTournament");

        alert(
          "Tournament cancelled. All completed games have been saved to history and will count toward player statistics."
        );
      } else {
        const { error: deleteError } = await supabase
          .from("tournaments")
          .delete()
          .eq("id", tournament.id);

        if (deleteError) {
          throw deleteError;
        }

        localStorage.removeItem("currentTournament");

        alert(
          "Tournament cancelled. All tournament data has been discarded."
        );
      }

      window.location.reload();
    } catch (err) {
      console.error(
        "Unable to cancel tournament:",
        err
      );

      alert(
        err.message ||
          "Unable to cancel the tournament."
      );
    } finally {
      setSaving(false);
      setShowCancelOptions(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h2>Current Tournament</h2>
        <p>Loading tournament...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <h2>Current Tournament</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!tournament || matches.length === 0) {
    return (
      <div className="page">
        <h2>Current Tournament</h2>
        <p>No tournament games found.</p>
      </div>
    );
  }

  const roundNumbers = [
    ...new Set(
      matches.map((match) => match.round_number)
    ),
  ].sort((a, b) => a - b);

  const highestRound =
    roundNumbers.length > 0
      ? roundNumbers[roundNumbers.length - 1]
      : 0;

  const roundMatches =
    getRoundMatches(currentRound);

  const allCurrentRoundCompleted =
    roundMatches.length > 0 &&
    roundMatches.every(
      (match) => match.status === "completed"
    );

  const isFinalRound =
    currentRound === highestRound;

  const finalLeaders = getFinalTieLeaders();

  const isPlayoffRound =
    currentRound > Number(tournament.total_rounds || 0);

  const hasTwoPlayerTie =
    isFinalRound &&
    !isPlayoffRound &&
    allCurrentRoundCompleted &&
    finalLeaders.length === 2;

  const hasMultiPlayerTie =
    isFinalRound &&
    !isPlayoffRound &&
    allCurrentRoundCompleted &&
    finalLeaders.length > 2;

  const overallChampion = getOverallChampion();

  const playoffComplete =
    isPlayoffRound &&
    allCurrentRoundCompleted &&
    overallChampion !== null;

  const tournamentComplete =
    (isFinalRound &&
      allCurrentRoundCompleted &&
      !hasTwoPlayerTie &&
      !hasMultiPlayerTie) ||
    playoffComplete;

  const totalRounds = isPlayoffRound
    ? Number(tournament.total_rounds || highestRound)
    : Number(tournament.total_rounds || highestRound);

  return (
    <div className="page">
      <h2>🏆 Head-to-Head Tournament</h2>

      <div className="player-card">
        <div>
          <strong>{tournament.name}</strong>
          <br />
          <small>
            {isPlayoffRound
              ? "🏆 Winner-Take-All Playoff"
              : `Round ${currentRound} of ${totalRounds}`}
          </small>
        </div>
      </div>

      <h3>
        {isPlayoffRound
          ? "🏆 Winner-Take-All Playoff"
          : `Round ${currentRound}`}
      </h3>

      {roundMatches.map((match, index) => {
        const matchPlayers =
          match.tournament_match_players || [];

        const winner = getWinner(match);

        const isEditing =
          editingMatchId === match.id;

        return (
          <div
            className="player-card"
            key={match.id}
          >
            <div style={{ width: "100%" }}>
              <strong>
                Game {index + 1}
              </strong>

              <br />

              🎰{" "}
              {match.machines?.name ||
                "Machine not assigned"}

              <br />
              <br />

              {matchPlayers.map(
                (matchPlayer, playerIndex) => {
                  const isWinner =
                    winner?.player_id ===
                    matchPlayer.player_id;

                  return (
                    <button
                      key={matchPlayer.id}
                      className={
                        isWinner && !isEditing
                          ? "winner-button"
                          : "nav-card"
                      }
                      style={{
                        width: "100%",
                        marginTop:
                          playerIndex === 0
                            ? "0"
                            : "8px",
                        opacity:
                          saving ? 0.7 : 1,
                      }}
                      disabled={saving}
                      onClick={() =>
                        selectWinner(
                          match,
                          matchPlayer.player_id
                        )
                      }
                    >
                      {isWinner && !isEditing
                        ? "🏆 "
                        : ""}
                      {matchPlayer.players
                        ?.first_name ||
                        "Unknown Player"}

                      {isWinner && !isEditing
                        ? " — WINNER"
                        : ""}
                    </button>
                  );
                }
              )}

              {isMatchCompleted(match) &&
                !isEditing && (
                  <>
                    <p>
                      <strong>
                        Game Complete
                      </strong>
                    </p>

                    <button
                      className="nav-card"
                      style={{
                        width: "100%",
                      }}
                      disabled={saving}
                      onClick={() =>
                        startEditing(match.id)
                      }
                    >
                      ✏️ Edit Result
                    </button>
                  </>
                )}

              {isEditing && (
                <p>
                  <strong>
                    Select the correct winner:
                  </strong>
                </p>
              )}
            </div>
          </div>
        );
      })}

      {!tournamentComplete &&
        !hasTwoPlayerTie &&
        !hasMultiPlayerTie &&
        !isPlayoffRound && (
          <button
            className="primary-button"
            disabled={
              !allCurrentRoundCompleted ||
              saving ||
              editingMatchId !== null
            }
            onClick={proceedToNextRound}
          >
            {saving
              ? "Saving..."
              : `Proceed to Round ${
                  currentRound + 1
                } →`}
          </button>
        )}

      {hasTwoPlayerTie && (
        <div className="player-card">
          <div>
            <h3>🏆 Tie for First!</h3>
            <p>
              {finalLeaders[0].player_name} and{" "}
              {finalLeaders[1].player_name} are tied
              with {finalLeaders[0].points} points.
            </p>
            <p>
              Play one winner-take-all Head-to-Head game
              to determine the tournament champion.
            </p>
          </div>

          <button
            className="primary-button"
            style={{
              width: "100%",
              marginTop: "10px",
            }}
            disabled={
              saving ||
              playoffStarting ||
              editingMatchId !== null
            }
            onClick={startWinnerTakeAllPlayoff}
          >
            {playoffStarting
              ? "Starting Playoff..."
              : "🏆 Start Winner-Take-All Playoff"}
          </button>
        </div>
      )}

      {hasMultiPlayerTie && (
        <div className="player-card">
          <div>
            <h3>⚠️ Tie for First</h3>
            <p>
              {finalLeaders.length} players are tied
              for first with {finalLeaders[0].points} points.
            </p>
            <p>
              A multi-player playoff format is required
              before this tournament can be finalized.
            </p>
          </div>
        </div>
      )}

      {tournamentComplete && (
        <>
          <div className="player-card">
            <div>
              <h3>🏆 Tournament Complete!</h3>
              <p>
                All {totalRounds} rounds have
                been completed.
              </p>
              <p>
                Review all results above, then
                finalize the tournament to save
                it to historical records.
              </p>
            </div>
          </div>

          <button
            className="primary-button"
            style={{
              width: "100%",
              marginTop: "10px",
            }}
            disabled={
              saving ||
              editingMatchId !== null
            }
            onClick={completeTournament}
          >
            {saving
              ? "Saving..."
              : "🏆 Complete Tournament"}
          </button>
        </>
      )}

      {!showCancelOptions && (
        <button
          className="nav-card"
          style={{
            width: "100%",
            marginTop: "16px",
          }}
          disabled={saving}
          onClick={() =>
            setShowCancelOptions(true)
          }
        >
          ✕ Cancel Tournament
        </button>
      )}

      {showCancelOptions && (
        <div
          className="player-card"
          style={{
            marginTop: "16px",
          }}
        >
          <h3>Cancel Tournament?</h3>

          <p>
            What would you like to do with the
            games already played?
          </p>

          <button
            className="primary-button"
            style={{
              width: "100%",
              marginBottom: "10px",
            }}
            disabled={saving}
            onClick={() =>
              cancelTournament(true)
            }
          >
            💾 Save Completed Games
          </button>

          <button
            className="nav-card"
            style={{
              width: "100%",
              marginBottom: "10px",
            }}
            disabled={saving}
            onClick={() =>
              cancelTournament(false)
            }
          >
            🗑️ Discard Tournament
          </button>

          <button
            className="nav-card"
            style={{
              width: "100%",
            }}
            disabled={saving}
            onClick={() =>
              setShowCancelOptions(false)
            }
          >
            ← Keep Tournament
          </button>
        </div>
      )}
    </div>
  );
}