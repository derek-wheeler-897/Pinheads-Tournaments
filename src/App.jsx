import { useState } from "react";
import {
  House,
  Users,
  MapPin,
  Trophy,
  Settings,
  Dices,
} from "lucide-react";

import "./App.css";

import Players from "./pages/Players";
import Locations from "./pages/Locations";
import Tournament from "./pages/Tournament";
import CurrentTournament from "./pages/CurrentTournament";
import LocationDetails from "./pages/LocationDetails";
import Machines from "./pages/Machines";
import Statistics from "./pages/Statistics";

export default function App() {
  const currentTournament =
    localStorage.getItem("currentTournament");

  const [navigation, setNavigation] = useState({
    page: "home",
    location: null,
  });

  function navigate(page) {
    setNavigation({
      page,
      location: null,
    });
  }

  function renderPage() {
    switch (navigation.page) {
      case "players":
        return <Players />;

      case "stats":
        return <Statistics />;

      case "machines":
        return <Machines />;

      case "locations":
        return (
          <Locations
            onOpen={(location) =>
              setNavigation({
                page: "location",
                location,
              })
            }
          />
        );

      case "location":
        return (
          <LocationDetails
            location={navigation.location}
            goBack={() => navigate("locations")}
          />
        );

      case "tournament":
        return <Tournament />;

      case "current":
        return <CurrentTournament />;

      case "home":
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
                onClick={() => navigate("players")}
              >
                <Users size={36} />
                <div>Players</div>
              </button>

              <button
  className="nav-card"
  onClick={() => navigate("stats")}
>
  <div
    style={{
      fontSize: "36px",
      lineHeight: "36px",
    }}
  >
    📊
  </div>

  <div>Statistics</div>
</button>

              <button
                className="nav-card"
                onClick={() => navigate("machines")}
              >
                <Dices size={36} />
                <div>Machines</div>
              </button>

              <button
                className="nav-card"
                onClick={() => navigate("locations")}
              >
                <MapPin size={36} />
                <div>Locations</div>
              </button>

              <button
                className="nav-card"
                onClick={() =>
                  navigate(
                    currentTournament
                      ? "current"
                      : "tournament"
                  )
                }
              >
                <Trophy size={36} />
                <div>
                  {currentTournament
                    ? "Resume Tournament"
                    : "Tournament"}
                </div>
              </button>

            <button
  className="nav-card"
  onClick={() =>
    window.alert(
      "⚙️ Settings\n\nComing Soon"
    )
  }
>
  <Settings size={36} />
  <div>Settings</div>
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
        <button onClick={() => navigate("home")}>
          <House size={22} />
        </button>

        <button onClick={() => navigate("players")}>
          <Users size={22} />
        </button>

        <button onClick={() => navigate("locations")}>
          <MapPin size={22} />
        </button>
      </nav>
    </div>
  );
}