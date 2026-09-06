import { useEffect, useState } from "react";
import { api } from "../api.js";
import { MONTHS } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

export default function PeriodCloseView() {
  const state = useWorkspace();
  const [periods, setPeriods] = useState([]);
  const [pipe, setPipe] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, pl] = await Promise.all([
          api.periods(state.year),
          api.pipeline(state.year, state.month)
        ]);
        if (cancelled) return;
        setPeriods(p);
        setPipe(pl);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta perioder.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.month, state.tick]);

  const checks = pipe ? [
    { label: "Underlag bokförda", ok: pipe.unbooked === 0 },
    { label: "Bank avstämd", ok: pipe.bankOk },
    { label: "Reskontra avstämd", ok: pipe.arOk && pipe.apOk },
    { label: "Moms avstämd", ok: pipe.vatOk },
    { label: "Rapport genomgången", ok: pipe.reportsReviewed },
    { label: "Kundrapport levererad", ok: pipe.delivered }
  ] : [];

  async function lock(month) {
    setBusy(true);
    setError(null);
    const res = await api.closePeriod(state.year, month);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setMsg(`${MONTHS[month - 1]} ${state.year} är låst.`);
    state.refresh();
  }

  async function yearEnd() {
    setBusy(true);
    setError(null);
    const res = await api.yearEnd(state.year);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setMsg(`Resultat överfört i ${res.voucherNo}. December låst.`);
    state.refresh();
  }

  return (
    <div className="stack">
      <div>
        <h2>Periodavslut</h2>
        <p className="lede">
          Byrån låser inte en månad förrän obokade underlag är noll och avstämning är godkänd för bank, kund, leverantör och moms.
          Verifikationer raderas inte — bokför rättelse i en öppen period.
        </p>
      </div>
      {pipe && (
        <ul className="check-grid">
          {checks.map((item) => (
            <li key={item.label} className="check-row">
              <span>{item.label}</span>
              <span className={item.ok ? "ledger" : "stamp"}>{item.ok ? "Klar" : "Saknas"}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="month-grid">
        {periods.map((p) => (
          <li key={p.month} className="card row-between">
            <span>
              <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 600 }}>{MONTHS[p.month - 1]}</span>
              <span className="muted" style={{ fontSize: "0.875rem" }}>{p.locked ? "Låst" : "Öppen"}</span>
            </span>
            <button type="button" className="btn btn-ghost" disabled={p.locked || busy} onClick={() => lock(p.month)}>
              {p.locked ? "Låst" : "Lås"}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={yearEnd}>Årsbokslut — överför resultatet</button>
      {error && <p className="stamp" role="alert">{error}</p>}
      {msg && <p className="ledger">{msg}</p>}
    </div>
  );
}
