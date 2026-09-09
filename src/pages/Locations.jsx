import { useEffect, useState } from "react";
import {
  getLocations,
  createLocation,
  deleteLocation,
} from "../services/locations";

export default function Locations({ onOpen }) {
  const [locations, setLocations] = useState([]);
  const [newLocation, setNewLocation] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLocations();
  }, []);

  async function loadLocations() {
    try {
      setLoading(true);
      const data = await getLocations();
      setLocations(data);
    } catch (err) {
      console.error(err);
      alert("Unable to load locations.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
  if (!newLocation.trim()) return;

  try {
    await createLocation(newLocation);
    setNewLocation("");
    await loadLocations();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

  async function handleDelete(id) {
    if (!window.confirm("Delete this location?")) return;

    try {
      await deleteLocation(id);
      loadLocations();
    } catch (err) {
      console.error(err);
      alert("Unable to delete location.");
    }
  }

function handleOpen(location) {
  onOpen(location);
}

  return (
    <div className="page">
      <h1>📍 Locations</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          style={{ flex: 1 }}
          value={newLocation}
          placeholder="New location..."
          onChange={(e) => setNewLocation(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />

        <button onClick={handleAdd}>
          Add
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : locations.length === 0 ? (
        <p>No locations yet.</p>
      ) : (
        locations.map((location) => (
          <div
            key={location.id}
            className="player-card"
          >
            <div>
              <strong>{location.name}</strong>
              <br />
              <small>{location.type}</small>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
              }}
            >
              <button
                onClick={() =>
                  handleOpen(location)
                }
              >
                Open
              </button>

              <button
                onClick={() =>
                  handleDelete(location.id)
                }
              >
                Delete
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}