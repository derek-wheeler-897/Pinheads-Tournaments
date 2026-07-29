import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");

  useEffect(() => {
    loadPlayers();
  }, []);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setPlayers(data);
  }

  async function addPlayer() {
    if (!name.trim()) return;

    const { error } = await supabase
      .from("players")
      .insert({
        first_name: name
      });

    if (error) {
      console.error(error);
      return;
    }

    setName("");
    loadPlayers();
  }

async function removePlayer(id) {
  const confirmed = window.confirm(
    "Delete this player?"
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    return;
  }

  loadPlayers();
}

return (
    <div className="page">

      <h2>Players</h2>

      <div className="add-player">

        <input
          placeholder="Player Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button onClick={addPlayer}>
          <Plus size={18}/>
          Add
        </button>

      </div>

      <div className="player-list">

        {players.length === 0 && (
          <p>No players yet.</p>
        )}

        {players.map(player => (
          <div
            className="player-card"
            key={player.id}
          >

            <div className="avatar">
              {player.first_name.charAt(0).toUpperCase()}
            </div>

            <div className="player-name">
              {player.first_name}
            </div>

            <button
              className="delete"
              onClick={() => removePlayer(player.id)}
            >
              <Trash2 size={18}/>
            </button>

          </div>
        ))}

      </div>

    </div>
  );
}