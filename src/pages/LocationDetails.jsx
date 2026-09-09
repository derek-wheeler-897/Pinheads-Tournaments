import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function LocationDetails({ location, goBack }) {
  const [machines, setMachines] = useState([]);
  const [newMachine, setNewMachine] = useState("");

  useEffect(() => {
    if (location) {
      loadMachines();
    }
  }, [location]);

  async function loadMachines() {
    const { data, error } = await supabase
      .from("location_machines")
      .select("*")
      .eq("location_id", location.id)
      .order("machine_name");

    if (error) {
      console.error(error);
      return;
    }

    setMachines(data || []);
  }

  async function addMachine() {
    if (!newMachine.trim()) return;

    const { error } = await supabase
  .from("location_machines")
  .insert({
    location_id: location.id,
    machine_name: newMachine.trim(),
    source: "manual",
    status: "available",
  });

    if (error) {
      alert(error.message);
      return;
    }

    setNewMachine("");
    await loadMachines();
  }

  async function deleteMachine(id) {
    const { error } = await supabase
      .from("location_machines")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadMachines();
  }

  if (!location) {
    return (
      <div className="page">
        <button onClick={goBack}>← Back</button>
        <h2>No location selected.</h2>
      </div>
    );
  }

  return (
    <div className="page">
      <button onClick={goBack}>← Back</button>

      <h1>{location.name}</h1>

      <p>
        <strong>Type:</strong> {location.type}
      </p>

      <hr />

      <h2>Machines</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={newMachine}
          onChange={(e) => setNewMachine(e.target.value)}
          placeholder="Machine name"
        />

        <button onClick={addMachine}>
          Add
        </button>
      </div>

      {machines.length === 0 ? (
        <p>No machines yet.</p>
      ) : (
        machines.map((machine) => (
          <div
            key={machine.id}
            className="player-card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div>{machine.machine_name}</div>

            <button onClick={() => deleteMachine(machine.id)}>
              Delete
            </button>
          </div>
        ))
      )}
    </div>
  );
}