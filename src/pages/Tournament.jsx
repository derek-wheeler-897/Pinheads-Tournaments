import { useState } from "react";
import { DB } from "../data/db";

export default function Tournament() {
  const players = DB.get("players", []);
  const machines = DB.get("machines", []);

  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [rounds, setRounds] = useState(10);
  const [points, setPoints] = useState("4,2,1");

  function togglePlayer(name) {
    setSelectedPlayers((prev) =>
      prev.includes(name)
        ? prev.filter((p) => p !== name)
        : [...prev, name]
    );
  }

  function toggleMachine(name) {
    setSelectedMachines((prev) =>
      prev.includes(name)
        ? prev.filter((m) => m !== name)
        : [...prev, name]
    );
  }

function createTournament() {
  if (selectedPlayers.length < 2) {
    alert("Select at least 2 players.");
    return;
  }

  if (selectedMachines.length === 0) {
    alert("Select at least 1 machine.");
    return;
  }

  if (rounds > selectedMachines.length) {
    alert(
      `Only ${selectedMachines.length} unique machines selected.`
    );
    return;
  }

  const shuffledMachines =
    [...selectedMachines].sort(
      () => Math.random() - 0.5
    );

  const roundsData =
    shuffledMachines
      .slice(0, Number(rounds))
      .map((machine, index) => ({
        round: index + 1,
        machine,
        results: [],
      }));

  const tournament = {
    id: Date.now(),
    created:
      new Date().toISOString(),
    players: selectedPlayers,
    machines: selectedMachines,
    rounds: roundsData,
    points:
      points.split(",").map(Number),
    currentRound: 1,
    standings: [],
  };

  DB.set(
    "currentTournament",
    tournament
  );

  alert(
    "Tournament created!"
  );

window.location.reload();
}

  return (
    <div className="page">
      <h2>Tournament Wizard</h2>

      <h3>Players</h3>

      <div className="selection-grid">
        {players.map((p) => (
          <button
            key={p.id}
            className={
              selectedPlayers.includes(p.name)
                ? "selected-card"
                : "nav-card"
            }
            onClick={() => togglePlayer(p.name)}
          >
              {selectedPlayers.includes(p.name) ? "✅ " : ""}
  {p.name}
          </button>
        ))}
      </div>

      <h3>Machines</h3>

      <div className="selection-grid">
        {machines.map((m) => (
          <button
            key={m.id}
            className={
              selectedMachines.includes(m.name)
                ? "selected-card"
                : "nav-card"
            }
            onClick={() => toggleMachine(m.name)}
          >
              {selectedMachines.includes(m.name) ? "✅ " : "🎰 "}
  {m.name}
          </button>
        ))}
      </div>

      <h3>Rounds</h3>

      <input
        type="number"
        value={rounds}
        onChange={(e) => setRounds(e.target.value)}
      />

      <h3>Points Per Place</h3>

      <input
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        placeholder="4,2,1"
      />

      <br />
      <br />

      <button
        className="primary-button"
        onClick={createTournament}
      >
        Create Tournament
      </button>
    </div>
  );
}