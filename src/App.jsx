import {
  Users,
  Gamepad2,
  History,
  Settings,
  Trophy,
  Plus
} from "lucide-react";

import "./App.css";

export default function App() {

  return (

    <div className="app">

      <header className="header">

        <div className="brand">

          <div className="logo">
            🎯
          </div>

          <div>
            <h1>
              PINHEADS
            </h1>

            <p>
              Tournament Manager
            </p>

          </div>

        </div>

      </header>


      <section className="hero">

        <div className="label">
          CURRENT TOURNAMENT
        </div>


        <h2>
          No Active Tournament
        </h2>


        <p>
          Start your first pinball tournament.
        </p>


        <button>

          <Plus size={20}/>

          New Tournament

        </button>


      </section>



      <h3>
        Quick Actions
      </h3>


      <div className="grid">


        <Card
          icon={<Users/>}
          title="Players"
        />


        <Card
          icon={<Gamepad2/>}
          title="Machines"
        />


        <Card
          icon={<History/>}
          title="History"
        />


        <Card
          icon={<Settings/>}
          title="Settings"
        />


      </div>



      <section className="champions">

        <div className="champion-title">

          <Trophy size={22}/>

          Recent Champions

        </div>


        <p>
          No tournaments completed yet.
        </p>


      </section>



      <nav className="bottom">

        <div className="active">
          🏠
          <span>
            Home
          </span>
        </div>


        <div>
          🏆
          <span>
            Tournament
          </span>
        </div>


        <div>
          📊
          <span>
            Stats
          </span>
        </div>


        <div>
          ⚙
          <span>
            Settings
          </span>
        </div>


      </nav>


    </div>

  );

}



function Card({icon,title}) {

  return (

    <div className="card">

      {icon}

      <span>
        {title}
      </span>

    </div>

  );

}