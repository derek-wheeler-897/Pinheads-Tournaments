import { useEffect, useRef, useState } from "react";
import { Camera, Plus, Trash2, X, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);

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

    setPlayers(data || []);
  }

  function openAddPlayer() {
    setEditingPlayer(null);
    setName("");
    setPhotoFile(null);
    setPhotoPreview("");
    setShowModal(true);
  }

  function openEditPlayer(player) {
    setEditingPlayer(player);
    setName(player.first_name || "");
    setPhotoFile(null);
    setPhotoPreview(player.photo_url || "");
    setShowModal(true);
  }

  function closeModal() {
    if (saving) return;

    setShowModal(false);
    setEditingPlayer(null);
    setName("");
    setPhotoFile(null);
    setPhotoPreview("");
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please choose an image.");
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function savePlayer() {
    const cleanName = name.trim();

    if (!cleanName || saving) return;

    setSaving(true);

    try {
      let playerId;

      /* -----------------------------------------
         CREATE
         ----------------------------------------- */

      if (!editingPlayer) {
        const { data, error } = await supabase
          .from("players")
          .insert({
            first_name: cleanName,
          })
          .select()
          .single();

        if (error) throw error;

        playerId = data.id;
      }

      /* -----------------------------------------
         UPDATE EXISTING PLAYER
         ----------------------------------------- */

      if (editingPlayer) {
        playerId = editingPlayer.id;

        const { error } = await supabase
          .from("players")
          .update({
            first_name: cleanName,
          })
          .eq("id", playerId);

        if (error) throw error;
      }

      /* -----------------------------------------
         UPLOAD PHOTO
         ----------------------------------------- */

      if (photoFile) {
        const extension =
          photoFile.name.split(".").pop()?.toLowerCase() || "jpg";

        const filePath = `${playerId}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("player-photos")
          .upload(filePath, photoFile, {
            upsert: true,
            contentType: photoFile.type,
          });

        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from("player-photos")
          .getPublicUrl(filePath);

        const photoUrl = publicUrl.publicUrl;

        const { error: photoUpdateError } = await supabase
          .from("players")
          .update({
            photo_url: photoUrl,
          })
          .eq("id", playerId);

        if (photoUpdateError) throw photoUpdateError;
      }

      closeModal();
      await loadPlayers();
    } catch (error) {
      console.error(error);
      alert("Unable to save player.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(player) {
    const confirmed = window.confirm(
      `Delete ${player.first_name}?`
    );

    if (!confirmed) return;

    try {
      if (player.photo_url) {
        const photoUrl = new URL(player.photo_url);
        const pathParts = photoUrl.pathname.split("/");

        const bucketIndex = pathParts.indexOf("player-photos");

        if (bucketIndex !== -1) {
          const filePath = pathParts
            .slice(bucketIndex + 1)
            .join("/");

          if (filePath) {
            await supabase.storage
              .from("player-photos")
              .remove([filePath]);
          }
        }
      }

      const { error } = await supabase
        .from("players")
        .delete()
        .eq("id", player.id);

      if (error) throw error;

      await loadPlayers();
    } catch (error) {
      console.error(error);
      alert("Unable to delete player.");
    }
  }

  return (
    <div className="page players-page">

      {/* HEADER */}

      <div className="players-topbar">
        <div>
          <h2>Players</h2>

          <p>
            {players.length}{" "}
            {players.length === 1 ? "player" : "players"}
          </p>
        </div>

        <button
          className="players-add-button"
          onClick={openAddPlayer}
          aria-label="Add player"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* PLAYER GRID */}

      {players.length === 0 ? (
        <div className="players-empty">

          <div className="players-empty-icon">
            <Camera size={30} />
          </div>

          <h3>No players yet</h3>

          <p>
            Add your players and give each one a photo.
          </p>

          <button
            className="players-empty-button"
            onClick={openAddPlayer}
          >
            <Plus size={19} />
            Add First Player
          </button>

        </div>
      ) : (
        <div className="players-grid">

          {players.map((player) => (
            <div
              className="iphone-player-card"
              key={player.id}
              onClick={() => openEditPlayer(player)}
            >

              {/* PHOTO */}

              <div className="player-photo-wrap">

                {player.photo_url ? (
                  <img
                    src={player.photo_url}
                    alt={player.first_name}
                    className="player-photo"
                  />
                ) : (
                  <div className="player-photo player-photo-placeholder">
                    {player.first_name
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}

                <button
                  type="button"
                  className="player-edit-badge"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditPlayer(player);
                  }}
                  aria-label={`Edit ${player.first_name}`}
                >
                  <Pencil size={14} />
                </button>

              </div>

              {/* NAME */}

              <div className="iphone-player-name">
                {player.first_name}
              </div>

              {/* DELETE */}

              <button
                type="button"
                className="player-delete-button"
                onClick={(event) => {
                  event.stopPropagation();
                  removePlayer(player);
                }}
                aria-label={`Delete ${player.first_name}`}
              >
                <Trash2 size={16} />
              </button>

            </div>
          ))}

        </div>
      )}

      {/* ADD / EDIT MODAL */}

      {showModal && (
        <div
          className="player-modal-backdrop"
          onClick={closeModal}
        >

          <div
            className="player-modal"
            onClick={(event) => event.stopPropagation()}
          >

            <div className="player-modal-header">

              <div>
                <h3>
                  {editingPlayer
                    ? "Edit Player"
                    : "New Player"}
                </h3>

                <p>
                  {editingPlayer
                    ? "Update name or photo"
                    : "Add a name and photo"}
                </p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={closeModal}
                aria-label="Close"
              >
                <X size={20} />
              </button>

            </div>

            {/* PHOTO PICKER */}

            <button
              type="button"
              className="photo-picker"
              onClick={() => fileInputRef.current?.click()}
            >

              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Player preview"
                />
              ) : (
                <>
                  <Camera size={30} />
                  <span>Add Photo</span>
                </>
              )}

            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoChange}
              style={{ display: "none" }}
            />

            {/* NAME */}

            <input
              className="player-name-input"
              type="text"
              placeholder="Player name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  savePlayer();
                }
              }}
              autoFocus
            />

            {/* SAVE */}

            <button
              type="button"
              className="save-player-button"
              onClick={savePlayer}
              disabled={!name.trim() || saving}
            >
              {saving
                ? "Saving..."
                : editingPlayer
                  ? "Save Changes"
                  : "Add Player"}
            </button>

          </div>

        </div>
      )}

    </div>
  );
}