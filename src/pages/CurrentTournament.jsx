import { DB } from "../data/db";

export default function CurrentTournament() {
  const tournament =
    DB.get(
      "currentTournament",
      null
    );

  if (!tournament) {
    return (
      <div className="page">
        <h2>
          No Active Tournament
        </h2>
      </div>
    );
  }

  const round =
    tournament.rounds[
      tournament.currentRound - 1
    ];

  return (
    <div className="page">
      <h2>
        Round {tournament.currentRound}
      </h2>

      <h3>
        🎰 {round.machine}
      </h3>

      <h3>Players</h3>

      {tournament.players.map(
        (p) => (
          <div
            className="player-card"
            key={p}
          >
            {p}
          </div>
        )
      )}
    </div>
  );
}