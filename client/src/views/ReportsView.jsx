import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatSek, todayIso } from "../money.js";
import { useWorkspace } from "../workspace.jsx";
import BalanceBlock from "../components/BalanceBlock.jsx";

const TABS = [
  { id: "saldobalans", label: "Saldobalans" },
  { id: "balans", label: "Balansräkning" },
  { id: "resultat", label: "Resultaträkning" },
  { id: "moms", label: "Moms" }
];

export default function ReportsView() {
  const state = useWorkspace();
  const [kind, setKind] = useState("saldobalans");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.reports(state.year);
        if (cancelled) return;
        setData(r);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte ta fram rapporten.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.tick]);

  async function avrakna() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await api.settleVat(state.year, todayIso(state.year));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setMsg(`Momsavräkning sparad som ${res.voucherNo}.`);
    state.refresh();
  }

  return (
    <div className="stack">
      <h2>Rapporter {state.year}</h2>
      <div className="pill-row">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`pill${kind === t.id ? " active" : ""}`} onClick={() => setKind(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && !data && <p className="stamp">{error}</p>}
      {!data && !error && <p className="muted">Räknar saldon…</p>}

      {data && kind === "saldobalans" && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Konto</th><th>Namn</th><th className="right">Debet</th><th className="right">Kredit</th><th className="right">Saldo</th></tr>
            </thead>
            <tbody>
              {data.trial.map((r) => (
                <tr key={r.number}>
                  <td className="tabular" style={{ fontWeight: 600 }}>{r.number}</td>
                  <td>{r.name}</td>
                  <td className="right tabular">{r.debit === 0 ? "" : formatSek(r.debit)}</td>
                  <td className="right tabular">{r.credit === 0 ? "" : formatSek(r.credit)}</td>
                  <td className="right tabular">{formatSek(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Omslutning {data.omslutningOk ? "— i balans" : "— obalans"}</td>
                <td className="right tabular">{formatSek(data.omslutningDebet)}</td>
                <td className="right tabular">{formatSek(data.omslutningKredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && kind === "balans" && (
        <div className="grid-2">
          <BalanceBlock title="Tillgångar" rows={data.assets} total={data.totalAssets} />
          <div className="stack">
            <BalanceBlock title="Skulder" rows={data.liabilities} />
            <BalanceBlock title="Eget kapital" rows={data.equity} />
            <article className="card">
              <p className="muted" style={{ fontSize: "0.875rem" }}>Årets resultat (ännu inte överfört)</p>
              <p className="eq">{formatSek(data.result)}</p>
              <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>Skulder + eget kapital + resultat</p>
              <p className="eq">{formatSek(data.totalEquityLiabilities)}</p>
            </article>
          </div>
        </div>
      )}

      {data && kind === "resultat" && (
        <div className="grid-2">
          <BalanceBlock title="Intäkter" rows={data.income} total={data.income.reduce((s, r) => s + r.balance, 0)} />
          <BalanceBlock title="Kostnader" rows={data.expense} total={data.expense.reduce((s, r) => s + r.balance, 0)} />
          <article className="card" style={{ gridColumn: "1 / -1", background: "var(--ledger)", color: "var(--ledger-fg)" }}>
            <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>Årets resultat</p>
            <p className="eq" style={{ fontSize: "1.75rem" }}>{formatSek(data.result)}</p>
          </article>
        </div>
      )}

      {data && kind === "moms" && (
        <article className="card stack-sm" style={{ maxWidth: "32rem" }}>
          <p className="row-between"><span>Utgående moms (2610)</span><span className="tabular">{formatSek(data.vatOut)}</span></p>
          <p className="row-between"><span>Ingående moms (2640)</span><span className="tabular">{formatSek(data.vatIn)}</span></p>
          <p className="row-between" style={{ borderTop: "1px solid var(--line)", paddingTop: "0.75rem", fontFamily: "var(--font-display)", fontWeight: 600 }}>
            <span>Moms att betala</span><span className="tabular">{formatSek(data.vatToPay)}</span>
          </p>
          <p className="muted" style={{ fontSize: "0.875rem" }}>
            Avräkning nollställer 2610 och 2640 mot redovisningskonto 2650 — en verifikation i balans.
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={avrakna}>Bokför momsavräkning</button>
          {error && <p className="stamp">{error}</p>}
          {msg && <p className="ledger">{msg}</p>}
        </article>
      )}
    </div>
  );
}
