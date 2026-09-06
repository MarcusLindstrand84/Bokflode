import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatSek, MONTHS } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

export default function DashboardView() {
  const state = useWorkspace();
  const [data, setData] = useState(null);
  const [pipe, setPipe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ws, p] = await Promise.all([
          api.workspace(state.year),
          api.pipeline(state.year, state.month)
        ]);
        if (cancelled) return;
        setData(ws);
        setPipe(p);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta översikten.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.month, state.tick]);

  if (error && !data) return <p className="stamp">{error}</p>;
  if (!data) return <p className="muted">Hämtar översikt…</p>;

  return (
    <div className="stack">
      <div className="row-between">
        <h2>Byråkontroll · {MONTHS[state.month - 1]}</h2>
        <button type="button" className="btn btn-primary" onClick={() => state.go("ny")}>Ny verifikation</button>
      </div>

      {pipe && (
        <>
          <ol className="step-grid">
            {pipe.steps.map((s, i) => {
              const target = s.id === "bokfor" ? "ny" : s.id === "moms" ? "rapporter" : s.id;
              return (
                <li key={s.id}>
                  <button type="button" className="step" onClick={() => state.go(target)}>
                    <span className={`meta${s.done ? " ok" : ""}`}>{i + 1}. {s.done ? "Klar" : "Öppen"}</span>
                    <span className="name">{s.label}</span>
                    <span className="hint">{s.hint}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {pipe.documentCount === 0 && (
            <p className="muted">Inga underlag ännu. Börja i Uppdrag, ta sedan emot underlag och bokför dem — debet måste vara lika med kredit.</p>
          )}
          {pipe.documentCount > 0 && !pipe.canLock && !pipe.locked && (
            <p className="stamp">
              Nästa steg: {pipe.unbooked > 0
                ? `bokför ${pipe.unbooked} underlag`
                : "stäm av bank, kund, leverantör och moms"} innan perioden kan låsas.
            </p>
          )}
        </>
      )}

      <section className={`card${data.equationOk && data.omslutningOk ? "" : " warn"}`}>
        <p className="kicker">Dubbel bokföring</p>
        <p className="eq">
          Tillgångar {formatSek(data.assets)} = Skulder {formatSek(data.liabilities)} + Eget kapital {formatSek(data.equity)} + Resultat {formatSek(data.result)}
        </p>
        <p className={`eq-note${data.equationOk && data.omslutningOk ? " ledger" : " stamp"}`}>
          {data.equationOk ? "Balanslikheten håller." : "Balanslikheten brister."}
          {" "}Omslutning debet {formatSek(data.omslutningDebet)} / kredit {formatSek(data.omslutningKredit)}
          {data.omslutningOk ? " — lika." : " — obalans."}
        </p>
      </section>

      <ul className="stat-grid grid-4">
        <li className="card stat">
          <p className="kicker">Bank och kassa</p>
          <p className="eq">{formatSek(data.bank)}</p>
        </li>
        <li className="card stat">
          <p className="kicker">Årets resultat</p>
          <p className="eq">{formatSek(data.result)}</p>
        </li>
        <li className="card stat">
          <p className="kicker">Moms att betala</p>
          <p className="eq">{formatSek(data.vatToPay)}</p>
        </li>
        <li className="card stat">
          <p className="kicker">Verifikationer</p>
          <p className="eq">{data.voucherCount}</p>
        </li>
      </ul>

      <section className="card">
        <div className="row-between">
          <h3>Senaste verifikationer</h3>
          <button type="button" className="btn btn-ghost" onClick={() => state.go("verifikationer")}>Visa alla</button>
        </div>
        <div className="table-wrap embed">
          <table className="data">
            <thead>
              <tr><th>Nr</th><th>Datum</th><th>Text</th><th className="right">Debet</th></tr>
            </thead>
            <tbody>
              {data.recent.length === 0 && (
                <tr><td colSpan={4} className="muted">Inga verifikationer ännu.</td></tr>
              )}
              {data.recent.map((v) => (
                <tr key={v.id}>
                  <td className="tabular">{v.voucherNo}</td>
                  <td className="tabular">{v.date}</td>
                  <td>{v.text}</td>
                  <td className="right tabular">{formatSek(v.debit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
