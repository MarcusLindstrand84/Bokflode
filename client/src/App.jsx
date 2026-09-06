import { useEffect, useState } from "react";
import { api, onUnauthorized } from "./api.js";
import { MONTHS } from "./money.js";
import { useWorkspace } from "./workspace.jsx";
import Icon from "./components/Icon.jsx";
import LoginView from "./views/LoginView.jsx";
import DashboardView from "./views/DashboardView.jsx";
import EngagementView from "./views/EngagementView.jsx";
import DocumentsView from "./views/DocumentsView.jsx";
import VoucherFormView from "./views/VoucherFormView.jsx";
import ReconcileView from "./views/ReconcileView.jsx";
import PeriodCloseView from "./views/PeriodCloseView.jsx";
import ClientReportView from "./views/ClientReportView.jsx";
import VoucherListView from "./views/VoucherListView.jsx";
import LedgerView from "./views/LedgerView.jsx";
import ReportsView from "./views/ReportsView.jsx";
import AccountsView from "./views/AccountsView.jsx";

const PROCESS = [
  { id: "oversikt", label: "Kontroll", icon: "scale" },
  { id: "uppdrag", label: "Uppdrag", icon: "briefcase" },
  { id: "underlag", label: "Underlag", icon: "stack" },
  { id: "ny", label: "Bokför", icon: "plus" },
  { id: "avstamning", label: "Avstämning", icon: "check" },
  { id: "avslut", label: "Avslut", icon: "lock" },
  { id: "kundrapport", label: "Kundrapport", icon: "landmark" }
];

const LEDGERS = [
  { id: "verifikationer", label: "Grundbok", icon: "list" },
  { id: "huvudbok", label: "Huvudbok", icon: "book" },
  { id: "rapporter", label: "Rapporter", icon: "landmark" },
  { id: "kontoplan", label: "Kontoplan", icon: "table" }
];

export default function App() {
  const state = useWorkspace();
  const [conn, setConn] = useState(null);
  const [firm, setFirm] = useState(null);
  const [user, setUser] = useState(undefined);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null);
      setFirm(null);
      setExpired(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const status = await api.health();
        if (cancelled) return;
        setConn(status);
        state.setServerLabel(status.database || status.engine);
        const me = await api.me();
        if (cancelled) return;
        if (me?.authenticated) {
          setUser(me.username);
          if (status.connected) setFirm(await api.firm());
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setTimeout(load, 800);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleLoggedIn(username) {
    setExpired(false);
    setUser(username);
    const status = await api.health();
    setConn(status);
    state.setServerLabel(status.database || status.engine);
    if (status.connected) setFirm(await api.firm());
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setFirm(null);
    setExpired(false);
  }

  const views = {
    oversikt: <DashboardView />,
    uppdrag: <EngagementView onSaved={async () => setFirm(await api.firm())} />,
    underlag: <DocumentsView />,
    ny: <VoucherFormView />,
    avstamning: <ReconcileView />,
    avslut: <PeriodCloseView />,
    kundrapport: <ClientReportView />,
    verifikationer: <VoucherListView />,
    huvudbok: <LedgerView />,
    rapporter: <ReportsView />,
    kontoplan: <AccountsView />
  };

  if (conn && !conn.connected) {
    return (
      <div className="app-shell">
        <div className="wrap stack">
          <p className="kicker">SQLite</p>
          <h1 className="title">Kunde inte ansluta</h1>
          <article className="card">
            <p>Bokflöde kunde inte öppna databasen {conn.database}.</p>
            <p className="muted" style={{ marginTop: "0.75rem" }}>
              Kontrollera att mappen data/ går att skriva. Filen skapas automatiskt som data/bokflode.sqlite.
            </p>
          </article>
        </div>
      </div>
    );
  }

  if (user === undefined) {
    return (
      <div className="app-shell">
        <div className="wrap"><p className="muted">Öppnar registret…</p></div>
      </div>
    );
  }

  if (!user) {
    return <LoginView expired={expired} onLoggedIn={handleLoggedIn} />;
  }

  if (!firm) {
    return (
      <div className="app-shell">
        <div className="wrap"><p className="muted">Öppnar registret…</p></div>
      </div>
    );
  }

  const ledeParts = [firm.companyName, firm.orgNr, `räkenskapsår ${state.year}`]
    .filter((p) => p && p !== "Nytt bolag");

  return (
    <div className="app-shell">
      <header className="header">
        <div className="wrap">
          <p className="kicker">
            SQLite · {state.serverLabel}
            {firm.engagement ? ` · ${firm.engagement}` : ""}
          </p>
          <div className="header-row">
            <div>
              <h1 className="title">Bokflöde</h1>
              <p className="lede">{ledeParts.join(" · ")}</p>
            </div>
            <div className="header-actions">
              <label className="period-field">
                Period
                <select
                  className="field"
                  value={state.month}
                  onChange={(e) => state.setMonth(Number(e.target.value))}
                >
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>{name}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-ghost" onClick={logout}>
                <Icon name="logout" /> Logga ut
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="nav" aria-label="Byråprocess">
        <div className="wrap wrap-narrow nav-row">
          {PROCESS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`nav-btn${state.tab === t.id ? " active" : ""}`}
              onClick={() => state.go(t.id)}
            >
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </nav>
      <nav className="nav-sub" aria-label="Register">
        <div className="wrap wrap-narrow nav-row">
          {LEDGERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`nav-btn${state.tab === t.id ? " active" : ""}`}
              onClick={() => state.go(t.id)}
            >
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap main" tabIndex={-1}>
        {views[state.tab]}
      </main>
    </div>
  );
}
