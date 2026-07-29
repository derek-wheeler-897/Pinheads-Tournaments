import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DB } from "../data/db";

export default function Machines() {
  const [machines, setMachines] = useState(
    DB.get("machines", [])
  );

  const [name, setName] = useState("");

  function addMachine() {
    if (!name.trim()) return;

    const updated = [
      ...machines,
      {
        id: Date.now(),
        name,
        active: true,
      },
    ];

    setMachines(updated);
    DB.set("machines", updated);
    setName("");
  }

  function removeMachine(id) {
    const updated = machines.filter(
      (m) => m.id !== id
    );

    setMachines(updated);
    DB.set("machines", updated);
  }

  return (
    <div className="page">
      <h2>Machines</h2>

      <div className="add-player">
        <input
          placeholder="Machine Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button
          className="primary-button"
          onClick={addMachine}
        >
          <Plus size={18} />
          Add
        </button>
      </div>

      <div className="player-list">
        {machines.length === 0 && (
          <p>No machines yet.</p>
        )}

        {machines.map((machine) => (
          <div
            className="player-card"
            key={machine.id}
          >
            <div className="avatar">
              🎰
            </div>

            <div className="player-name">
              {machine.name}
            </div>

            <button
              className="delete"
              onClick={() =>
                removeMachine(machine.id)
              }
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}