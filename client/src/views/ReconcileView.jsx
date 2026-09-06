import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatSek, MONTHS, parseAmount, reconLabel } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

const KINDS = ["bank", "kund", "leverantor", "moms"];

export default function ReconcileView() {
  const state = useWorkspace();
  const [sides, setSides] = useState(null);
  const [saved, setSaved] = useState([]);
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.reconciliations(state.year, state.month);
        if (cancelled) return;
        setSides(data.sides);
        setSaved(data.saved);
        const next = {};
        for (const row of data.saved) next[row.kind] = String(row.statementBalance);
        setValues((prev) => ({ ...next, ...prev }));
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta avstämningar.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.month, state.tick]);

  async function save(kind) {
    setBusy(kind);
    setError(null);
    await api.saveRecon({
      year: state.year,
      month: state.month,
      kind,
      statementBalance: parseAmount(values[kind] ?? "0"),
      note: ""
    });
    setBusy(null);
    state.refresh();
  }

  const sideOf = (kind) => {
    if (!sides) return 0;
    if (kind === "bank") return sides.bank;
    if (kind === "kund") return sides.kund;
    if (kind === "leverantor") return sides.leverantor;
    return sides.moms;
  };

  return (
    <div className="stack">
      <div>
        <h2>Avstämning · {MONTHS[state.month - 1]}</h2>
        <p className="lede">
          Jämför bokens saldo (ackumulerat till periodens sista dag) med underlag: kontoutdrag, reskontra och momsspecifikation.
          Banken måste stämma innan månaden får låsas.
        </p>
      </div>
      {error && <p className="stamp">{error}</p>}
      {!sides ? (
        <p className="muted">Hämtar saldon…</p>
      ) : (
        <ul className="card-grid">
          {KINDS.map((kind) => {
            const book = sideOf(kind);
            const row = saved.find((r) => r.kind === kind);
            return (
              <li key={kind} className="card stack-sm">
                <p style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{reconLabel(kind)}</p>
                <p className="muted" style={{ fontSize: "0.875rem" }}>Bokfört saldo {formatSek(book)}</p>
                <label className="lbl">Saldo enligt underlag
                  <input
                    className="field right tabular"
                    inputMode="decimal"
                    value={values[kind] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [kind]: e.target.value }))}
                  />
                </label>
                <div className="row-between">
                  <p className={row?.ok ? "ledger" : "muted"} style={{ fontSize: "0.875rem" }}>
                    {!row ? "Ej avstämd" : row.ok ? "Stämmer" : `Avvikelse ${formatSek(row.statementBalance - row.bookBalance)}`}
                  </p>
                  <button type="button" className="btn btn-primary" disabled={busy === kind} onClick={() => save(kind)}>Stäm av</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
