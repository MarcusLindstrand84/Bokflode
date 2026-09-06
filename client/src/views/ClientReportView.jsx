import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatSek, MONTHS } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

export default function ClientReportView() {
  const state = useWorkspace();
  const [firm, setFirm] = useState(null);
  const [rep, setRep] = useState(null);
  const [pipe, setPipe] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [f, r, p] = await Promise.all([
          api.firm(),
          api.reports(state.year),
          api.pipeline(state.year, state.month)
        ]);
        if (cancelled) return;
        setFirm(f);
        setRep(r);
        setPipe(p);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte ta fram kundrapporten.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.month, state.tick]);

  async function deliver() {
    setBusy(true);
    await api.closeFlag({ year: state.year, month: state.month, flag: "leverans", done: true });
    await api.closeFlag({ year: state.year, month: state.month, flag: "rapporter", done: true });
    setBusy(false);
    state.refresh();
  }

  if (error) return <p className="stamp">{error}</p>;
  if (!firm || !rep || !pipe) return <p className="muted">Sätter samman rapporten…</p>;

  return (
    <article className="card stack">
      <header style={{ borderBottom: "1px solid var(--line)", paddingBottom: "var(--space-4)" }}>
        <p className="kicker">Månadsrapport till klient</p>
        <h2 style={{ marginTop: "var(--space-1)" }}>{firm.companyName}</h2>
        <p className="lede">Org.nr {firm.orgNr} · {MONTHS[state.month - 1]} {state.year} · {firm.engagement}</p>
      </header>
      <section className="grid-3">
        <p className="card stat" style={{ boxShadow: "none", background: "var(--paper)", borderRadius: "var(--radius-md)" }}>
          <span className="stat-label">Resultat hittills</span>
          <span className="stat-value">{formatSek(rep.result)}</span>
        </p>
        <p className="card stat" style={{ boxShadow: "none", background: "var(--paper)", borderRadius: "var(--radius-md)" }}>
          <span className="stat-label">Tillgångar</span>
          <span className="stat-value">{formatSek(rep.totalAssets)}</span>
        </p>
        <p className="card stat" style={{ boxShadow: "none", background: "var(--paper)", borderRadius: "var(--radius-md)" }}>
          <span className="stat-label">Moms att betala</span>
          <span className="stat-value">{formatSek(rep.vatToPay)}</span>
        </p>
      </section>
      <section>
        <h3>Resultaträkning</h3>
        <ul className="list-plain">
          {[...rep.income, ...rep.expense].map((r) => (
            <li key={r.number}>
              <span>{r.number} {r.name}</span>
              <span className="tabular">{formatSek(r.balance)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Kvalitet</h3>
        <ul className="stack-sm" style={{ fontSize: "0.875rem", listStyle: "none", padding: 0, margin: "var(--space-2) 0 0" }}>
          <li>{pipe.unbooked === 0 ? "Alla underlag i perioden är hanterade." : `${pipe.unbooked} underlag obokade.`}</li>
          <li>{pipe.bankOk ? "Bankavstämning godkänd." : "Bankavstämning saknas."}</li>
          <li>{rep.omslutningOk ? "Omslutning debet = kredit." : "Omslutningen är i obalans."}</li>
          <li>{pipe.locked ? "Perioden är låst." : "Perioden är öppen."}</li>
        </ul>
      </section>
      <p className="muted" style={{ fontSize: "0.875rem" }}>
        Rapporten är ett underlag för klienten, inte en revisorberättelse. Skatt och årsredovisning kräver separat genomgång.
      </p>
      <button type="button" className="btn btn-primary" disabled={busy || pipe.delivered} onClick={deliver}>
        {pipe.delivered ? "Markerad som levererad" : "Markera rapporten levererad"}
      </button>
    </article>
  );
}
