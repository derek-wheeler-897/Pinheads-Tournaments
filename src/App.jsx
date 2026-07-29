import { useState } from "react";
import {
  House,
  Users,
  Dice5,
  Trophy,
  Settings
} from "lucide-react";

import "./App.css";

import Players from "./pages/Players";
import Machines from "./pages/Machines";
import Tournament from "./pages/Tournament";
import CurrentTournament from "./pages/CurrentTournament";

export default function App() {
  const currentTournament =
  localStorage.getItem(
    "currentTournament"
  );
  console.log(currentTournament);
  const [page, setPage] =
    useState("home");

  function renderPage() {
    switch (page) {
      case "players":
        return <Players />;

      case "machines":
        return <Machines />;

        case "tournament":
  return <Tournament />;

  case "current":
  return <CurrentTournament />;

      default:
        return (
          <div className="page">
            <h1>🎯 Pinheads</h1>

{currentTournament && (
  <div className="player-card">
    <div>
      🏆 Tournament In Progress
      <br />
      Click Tournament to resume.
    </div>
  </div>
)}

            <div className="home-grid">

              <button
                className="nav-card"
                onClick={() =>
                  setPage("players")
                }
              >
                <Users size={36}/>
                Players
              </button>

              <button
                className="nav-card"
                onClick={() =>
                  setPage("machines")
                }
              >
                <Dice5 size={36}/>
                Machines
              </button>

<button
 className="nav-card"
  onClick={() =>
    setPage(
      currentTournament
        ? "current"
        : "tournament"
    )
  }
>
  <Trophy size={36} />

  {currentTournament
    ? "Resume Tournament"
    : "Tournament"}
</button>

              <button
                className="nav-card"
              >
                <Settings size={36}/>
                Settings
              </button>

            </div>
          </div>
        );
    }
  }

  return (
    <div className="app">

      {renderPage()}

      <nav className="bottom-nav">

        <button
          onClick={() =>
            setPage("home")
          }
        >
          <House size={22}/>
        </button>

        <button
          onClick={() =>
            setPage("players")
          }
        >
          <Users size={22}/>
        </button>

        <button
          onClick={() =>
            setPage("machines")
          }
        >
          <Dice5 size={22}/>
        </button>

      </nav>

    </div>
  );
}