import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { formatSek } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

export default function LedgerView() {
  const state = useWorkspace();
  const [accounts, setAccounts] = useState([]);
  const [rows, setRows] = useState([]);
  const [account, setAccount] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    api.accounts().then(setAccounts).catch(() => setError("Kunde inte hämta kontoplanen."));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.ledger(state.year, account);
        if (cancelled) return;
        setRows(data);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta huvudboken.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, account, state.tick]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.account)) map.set(r.account, { number: r.account, name: r.name, rows: [] });
      map.get(r.account).rows.push(r);
    }
    return [...map.values()];
  }, [rows]);

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h2>Huvudbok</h2>
          <p className="lede">T-konton: debet till vänster, kredit till höger.</p>
        </div>
        <label className="period-field">Konto
          <select className="field" style={{ minWidth: "16rem" }} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Alla konton</option>
            {accounts.map((a) => (
              <option key={a.number} value={a.number}>{a.number} {a.name}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="stamp">{error}</p>}
      {groups.map((g) => {
        const last = g.rows[g.rows.length - 1];
        return (
          <article key={g.number} className="card">
            <h3>{g.number} {g.name}</h3>
            <div className="table-wrap embed">
              <table className="data">
                <thead><tr><th>Ver</th><th>Text</th><th className="right">Debet</th><th className="right">Kredit</th></tr></thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={`${r.voucherId}-${i}`}>
                      <td className="tabular">{r.voucherNo} {r.date}</td>
                      <td>{r.text}</td>
                      <td className="right tabular">{r.debit === 0 ? "" : formatSek(r.debit)}</td>
                      <td className="right tabular">{r.credit === 0 ? "" : formatSek(r.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="right tabular" style={{ marginTop: "var(--space-3)", fontSize: "0.875rem", fontWeight: 600 }}>
              Saldo {formatSek(last?.balance ?? 0)}
            </p>
          </article>
        );
      })}
    </div>
  );
}
