import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Machines() {
  const [machines, setMachines] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => {
    loadMachines();
  }, []);

  async function loadMachines() {
    const { data, error } = await supabase
      .from("machines")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setMachines(data || []);
  }

  async function addMachine() {
  console.log("Button clicked");
  console.log("Machine name:", name);

  if (!name.trim()) {
    console.log("Name is empty");
    return;
  }

  const { data, error } = await supabase
    .from("machines")
    .insert({
      name: name.trim(),
    })
    .select();

  console.log("Insert data:", data);
  console.log("Insert error:", error);

  if (error) {
    alert(error.message);
    return;
  }

  setName("");
  loadMachines();
}

  async function removeMachine(id) {
    const confirmed = window.confirm("Delete this machine?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("machines")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      return;
    }

    loadMachines();
  }

  return (
    <div className="page">
      <h2>Machines</h2>

      <div className="add-player">
        <input
          placeholder="Machine Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              addMachine();
            }
          }}
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
            <div className="avatar">🎰</div>

            <div className="player-name">
              {machine.name}
            </div>

            <button
              className="delete"
              onClick={() => removeMachine(machine.id)}
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}