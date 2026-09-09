import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Tournament() {
  const [players, setPlayers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [machines, setMachines] = useState([]);

  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedMachines, setSelectedMachines] = useState([]);

  const [rounds, setRounds] = useState(10);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadingMachines, setLoadingMachines] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const { data: locationData, error: locationError } =
        await supabase
          .from("locations")
          .select("*")
          .order("name", { ascending: true });

      if (locationError) {
        console.error("Locations error:", locationError);
        alert(
          locationError.message ||
            "Unable to load locations."
        );
      } else {
        setLocations(locationData || []);
      }

      const { data: playerData, error: playerError } =
        await supabase
          .from("players")
          .select("*")
          .order("created_at", { ascending: true });

      if (playerError) {
        console.error("Players error:", playerError);
        alert(
          playerError.message ||
            "Unable to load players."
        );
      } else {
        setPlayers(playerData || []);
      }
    } catch (error) {
      console.error("Unable to load tournament setup:", error);
      alert(
        error.message ||
          "Unable to load tournament setup."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadLocationMachines(locationId) {
    setSelectedLocation(locationId);
    setSelectedMachines([]);
    setMachines([]);

    if (!locationId) {
      return;
    }

    setLoadingMachines(true);

    try {
      const { data: locationMachines, error } =
        await supabase
          .from("location_machines")
          .select("machine_name, status")
          .eq("location_id", locationId)
          .order("machine_name", {
            ascending: true,
          });

      if (error) {
        throw error;
      }

      // Every machine listed for the selected location is
      // available for tournament setup. The location_machines
      // table currently uses statuses such as "available",
      // so do not filter these rows by status.
      const locationMachineRows = locationMachines || [];

      if (locationMachineRows.length === 0) {
        setMachines([]);
        setLoadingMachines(false);
        return;
      }

      const { data: allMachines, error: machineError } =
        await supabase
          .from("machines")
          .select("*")
          .order("name", {
            ascending: true,
          });

      if (machineError) {
        throw machineError;
      }

      const locationMachineNames = new Set(
        locationMachineRows.map(
          (machine) =>
            (machine.machine_name || "")
              .trim()
              .toLowerCase()
        )
      );

      const matchingMachines = (allMachines || []).filter(
        (machine) =>
          locationMachineNames.has(
            (machine.name || "").trim().toLowerCase()
          )
      );

      setMachines(matchingMachines);
    } catch (error) {
      console.error(
        "Unable to load location machines:",
        error
      );

      alert(
        error.message ||
          "Unable to load machines for this location."
      );
    } finally {
      setLoadingMachines(false);
    }
  }

  function togglePlayer(playerId) {
    setSelectedPlayers((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  }

  function toggleMachine(machineId) {
    setSelectedMachines((prev) =>
      prev.includes(machineId)
        ? prev.filter((id) => id !== machineId)
        : [...prev, machineId]
    );
  }

  function generateHeadToHeadMatches(
    playerIds,
    gamesPerPlayer
  ) {
    const playerCount = playerIds.length;

    if (
      (playerCount * gamesPerPlayer) %
        2 !==
      0
    ) {
      throw new Error(
        "This combination of players and games cannot create an equal Head-to-Head schedule."
      );
    }

    const games = [];
    let gameNumber = 1;

    // Two players:
    // They play each other every game.
    if (playerCount === 2) {
      for (
        let i = 0;
        i < gamesPerPlayer;
        i++
      ) {
        games.push({
          gameNumber: gameNumber++,
          roundNumber: i + 1,
          player1: playerIds[0],
          player2: playerIds[1],
        });
      }

      return games;
    }

    // Even number of players.
    // Build a true round-robin schedule.
    if (playerCount % 2 === 0) {
      const participants = [...playerIds];
      const rounds = [];

      for (
        let round = 0;
        round < playerCount - 1;
        round++
      ) {
        const roundGames = [];

        for (
          let i = 0;
          i < playerCount / 2;
          i++
        ) {
          roundGames.push({
            player1:
              participants[i],
            player2:
              participants[
                playerCount - 1 - i
              ],
          });
        }

        rounds.push(roundGames);

        // Keep first player fixed and
        // rotate everyone else.
        const fixed =
          participants[0];

        const rotating =
          participants.slice(1);

        rotating.unshift(
          rotating.pop()
        );

        participants.splice(
          0,
          participants.length,
          fixed,
          ...rotating
        );
      }

      // Randomize the order of the
      // round-robin rounds.
      const shuffledRounds =
        [...rounds].sort(
          () => Math.random() - 0.5
        );

      for (
        let round = 0;
        round < gamesPerPlayer;
        round++
      ) {
        const sourceRound =
          shuffledRounds[
            round %
              shuffledRounds.length
          ];

        const shuffledGames =
          [...sourceRound].sort(
            () => Math.random() - 0.5
          );

        shuffledGames.forEach(
          (game) => {
            games.push({
              gameNumber:
                gameNumber++,
              roundNumber:
                round + 1,
              player1:
                game.player1,
              player2:
                game.player2,
            });
          }
        );
      }

      return games;
    }

    // Odd number of players.
    // Build games while trying to minimize
    // repeated opponents and distribute
    // sit-outs evenly.
    const totalGames =
      (playerCount *
        gamesPerPlayer) /
      2;

    const gamesPlayed = {};
    const opponentCounts = {};

    playerIds.forEach(
      (playerId) => {
        gamesPlayed[playerId] = 0;
        opponentCounts[playerId] = {};
      }
    );

    let safetyCounter = 0;

    while (
      games.length < totalGames
    ) {
      safetyCounter++;

      if (safetyCounter > 10000) {
        throw new Error(
          "Unable to generate a balanced Head-to-Head schedule."
        );
      }

      const availablePlayers =
        [...playerIds]
          .filter(
            (playerId) =>
              gamesPlayed[playerId] <
              gamesPerPlayer
          )
          .sort(
            (a, b) =>
              gamesPlayed[a] -
                gamesPlayed[b] ||
              Math.random() -
                0.5
          );

      const usedThisRound =
        new Set();

      let createdThisRound = false;

      for (
        let i = 0;
        i <
        availablePlayers.length;
        i++
      ) {
        const player1 =
          availablePlayers[i];

        if (
          usedThisRound.has(
            player1
          )
        ) {
          continue;
        }

        const opponents =
          availablePlayers
            .filter(
              (player2) =>
                player2 !== player1 &&
                !usedThisRound.has(
                  player2
                ) &&
                gamesPlayed[player2] <
                  gamesPerPlayer
            )
            .sort((a, b) => {
              const countA =
                opponentCounts[
                  player1
                ][a] || 0;

              const countB =
                opponentCounts[
                  player1
                ][b] || 0;

              return (
                countA - countB
              );
            });

        if (
          opponents.length === 0
        ) {
          continue;
        }

        const player2 =
          opponents[0];

        games.push({
          gameNumber:
            gameNumber++,
          roundNumber:
            Math.max(
              ...playerIds.map(
                (id) =>
                  gamesPlayed[id]
              )
            ) + 1,
          player1,
          player2,
        });

        gamesPlayed[player1]++;
        gamesPlayed[player2]++;

        opponentCounts[
          player1
        ][player2] =
          (opponentCounts[
            player1
          ][player2] || 0) + 1;

        opponentCounts[
          player2
        ][player1] =
          (opponentCounts[
            player2
          ][player1] || 0) + 1;

        usedThisRound.add(
          player1
        );
        usedThisRound.add(
          player2
        );

        createdThisRound = true;

        if (
          games.length >=
          totalGames
        ) {
          break;
        }
      }

      if (!createdThisRound) {
        throw new Error(
          "Unable to generate a balanced Head-to-Head schedule."
        );
      }
    }

    return games;
  }

  async function createTournament() {
    if (!selectedLocation) {
      alert(
        "Select a tournament location."
      );
      return;
    }

    if (selectedPlayers.length < 2) {
      alert(
        "Select at least 2 players."
      );
      return;
    }

    if (selectedMachines.length === 0) {
      alert(
        "Select at least 1 machine."
      );
      return;
    }

    const gamesPerPlayer =
      Number(rounds);

    if (
      gamesPerPlayer < 3 ||
      gamesPerPlayer > 10
    ) {
      alert(
        "Games per player must be between 3 and 10."
      );
      return;
    }

    // Odd players require an even
    // number of games per player.
    if (
      selectedPlayers.length % 2 !==
        0 &&
      gamesPerPlayer % 2 !== 0
    ) {
      alert(
        "With an odd number of players, Games Per Player must be an even number."
      );
      return;
    }

    setCreating(true);

    try {
      const {
        data: tournamentTypeRows,
        error: typeError,
      } = await supabase
        .from("tournament_types")
        .select("*")
        .eq("slug", "head_to_head")
        .eq("active", true);

      if (typeError) {
        throw typeError;
      }

      if (
        !tournamentTypeRows ||
        tournamentTypeRows.length !== 1
      ) {
        throw new Error(
          `Expected exactly 1 active Head-to-Head tournament type, but found ${
            tournamentTypeRows?.length ||
            0
          }.`
        );
      }

      const tournamentType =
        tournamentTypeRows[0];

      const {
        data: tournament,
        error: tournamentError,
      } = await supabase
        .from("tournaments")
        .insert({
          name:
            "Head-to-Head Tournament",
          tournament_type_id:
            tournamentType.id,
          location_id:
            selectedLocation,
          total_rounds:
            gamesPerPlayer,
          status: "active",
        })
        .select()
        .single();

      if (tournamentError) {
        throw tournamentError;
      }

      const tournamentPlayerRows =
        selectedPlayers.map(
          (playerId) => ({
            tournament_id:
              tournament.id,
            player_id: playerId,
          })
        );

      const {
        error: playersError,
      } = await supabase
        .from("tournament_players")
        .insert(
          tournamentPlayerRows
        );

      if (playersError) {
        throw playersError;
      }

      const matches =
        generateHeadToHeadMatches(
          selectedPlayers,
          gamesPerPlayer
        );

      const expectedMatches =
        (selectedPlayers.length *
          gamesPerPlayer) /
        2;

      if (
        matches.length !==
        expectedMatches
      ) {
        throw new Error(
          `Schedule error: expected ${expectedMatches} games but generated ${matches.length}.`
        );
      }

      // Verify every player has
      // exactly the requested number
      // of games.
      const verification = {};

      selectedPlayers.forEach(
        (playerId) => {
          verification[playerId] = 0;
        }
      );

      matches.forEach((match) => {
        if (
          !verification.hasOwnProperty(
            match.player1
          ) ||
          !verification.hasOwnProperty(
            match.player2
          )
        ) {
          throw new Error(
            "Schedule error: an unknown player was included."
          );
        }

        if (
          match.player1 ===
          match.player2
        ) {
          throw new Error(
            "Schedule error: a player cannot play against themselves."
          );
        }

        verification[
          match.player1
        ]++;

        verification[
          match.player2
        ]++;
      });

      const invalidPlayers =
        selectedPlayers.filter(
          (playerId) =>
            verification[
              playerId
            ] !== gamesPerPlayer
        );

      if (
        invalidPlayers.length > 0
      ) {
        throw new Error(
          "Schedule error: one or more players do not have the correct number of games."
        );
      }

      const matchRows =
        matches.map((match) => ({
          tournament_id:
            tournament.id,
          round_number:
            match.roundNumber,
          machine_id:
            selectedMachines[
              (match.gameNumber - 1) %
                selectedMachines.length
            ],
          status: "pending",
        }));

      const {
        data: createdMatches,
        error: matchesError,
      } = await supabase
        .from("tournament_matches")
        .insert(matchRows)
        .select();

      if (matchesError) {
        throw matchesError;
      }

      const matchPlayerRows = [];

      createdMatches.forEach(
        (match, index) => {
          const sourceMatch =
            matches[index];

          matchPlayerRows.push(
            {
              match_id: match.id,
              player_id:
                sourceMatch.player1,
              position: null,
              points: 0,
            },
            {
              match_id: match.id,
              player_id:
                sourceMatch.player2,
              position: null,
              points: 0,
            }
          );
        }
      );

      const {
        error: matchPlayersError,
      } = await supabase
        .from("tournament_match_players")
        .insert(
          matchPlayerRows
        );

      if (matchPlayersError) {
        throw matchPlayersError;
      }

      localStorage.setItem(
        "currentTournament",
        JSON.stringify({
          id: tournament.id,
          type: "head_to_head",
          rounds: gamesPerPlayer,
          locationId:
            selectedLocation,
        })
      );

      alert(
        "Head-to-Head tournament created!"
      );

      window.location.reload();
    } catch (error) {
      console.error(
        "Tournament creation failed:",
        error
      );

      alert(
        error.message ||
          "Unable to create tournament."
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <h2>
          Tournament Wizard
        </h2>
        <p>
          Loading players and locations...
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>
        Tournament Wizard
      </h2>

      <h3>
        Tournament Type
      </h3>

      <div className="player-card">
        <div>
          <strong>
            Head-to-Head
          </strong>
          <br />
          <small>
            Two players per game.
            Winner gets 1 point.
          </small>
        </div>
      </div>

      <h3>
        Location
      </h3>

      {locations.length === 0 ? (
        <div className="player-card">
          <p>
            No locations have been
            created yet.
          </p>
          <p>
            Add a location before
            creating a tournament.
          </p>
        </div>
      ) : (
        <div className="player-card">
          <select
            value={selectedLocation}
            onChange={(e) =>
              loadLocationMachines(
                e.target.value
              )
            }
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              fontSize: "16px",
            }}
          >
            <option value="">
              Select a location...
            </option>

            {locations.map(
              (location) => (
                <option
                  key={location.id}
                  value={location.id}
                >
                  {location.name}
                </option>
              )
            )}
          </select>
        </div>
      )}

      {selectedLocation && (
        <>
          <h3>
            Machines at Location
          </h3>

          {loadingMachines ? (
            <div className="player-card">
              <p>
                Loading machines...
              </p>
            </div>
          ) : machines.length ===
            0 ? (
            <div className="player-card">
              <p>
                No machines are
                assigned to this
                location.
              </p>
              <p>
                Add machines to this
                location before
                creating a tournament.
              </p>
            </div>
          ) : (
            <div className="selection-grid">
              {machines.map(
                (machine) => (
                  <button
                    key={machine.id}
                    className={
                      selectedMachines.includes(
                        machine.id
                      )
                        ? "selected-card"
                        : "nav-card"
                    }
                    onClick={() =>
                      toggleMachine(
                        machine.id
                      )
                    }
                  >
                    {selectedMachines.includes(
                      machine.id
                    )
                      ? "✅ "
                      : "🎰 "}
                    {machine.name}
                  </button>
                )
              )}
            </div>
          )}
        </>
      )}

      <h3>
        Players
      </h3>

      {players.length === 0 ? (
        <p>
          No players yet. Add players
          first.
        </p>
      ) : (
        <div className="selection-grid">
          {players.map((player) => (
            <button
              key={player.id}
              className={
                selectedPlayers.includes(
                  player.id
                )
                  ? "selected-card"
                  : "nav-card"
              }
              onClick={() =>
                togglePlayer(
                  player.id
                )
              }
            >
              {selectedPlayers.includes(
                player.id
              )
                ? "✅ "
                : ""}
              {player.first_name}
            </button>
          ))}
        </div>
      )}

      <h3>
        Games Per Player
      </h3>

      <input
        type="number"
        min="3"
        max="10"
        value={rounds}
        onChange={(e) =>
          setRounds(e.target.value)
        }
      />

      <p>
        Each player will play
        exactly {rounds}{" "}
        Head-to-Head games.
      </p>

      <p>
        <strong>
          Scoring:
        </strong>{" "}
        Win = 1 point, Loss = 0
        points
      </p>

      <br />

      <button
        className="primary-button"
        onClick={createTournament}
        disabled={
          creating ||
          !selectedLocation ||
          selectedMachines.length ===
            0
        }
      >
        {creating
          ? "Creating Tournament..."
          : "Create Tournament"}
      </button>
    </div>
  );
}
