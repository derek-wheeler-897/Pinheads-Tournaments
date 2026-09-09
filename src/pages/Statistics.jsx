import { useState } from "react";
import PlayerStats from "./PlayerStats";
import TournamentHistory from "./TournamentHistory";

export default function Statistics() {
  const [section, setSection] = useState("stats");

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <button
          className={
            section === "stats"
              ? "primary-button"
              : "nav-card"
          }
          onClick={() => setSection("stats")}
          style={{ width: "100%" }}
        >
          📊 Player Stats
        </button>

        <button
          className={
            section === "history"
              ? "primary-button"
              : "nav-card"
          }
          onClick={() => setSection("history")}
          style={{ width: "100%" }}
        >
          🏆 Tournament History
        </button>
      </div>

      {section === "stats" ? (
        <PlayerStats />
      ) : (
        <TournamentHistory />
      )}
    </div>
  );
}