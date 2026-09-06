import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatSek, toOre, todayIso } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

export default function VoucherListView() {
  const state = useWorkspace();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.vouchers(state.year);
        if (cancelled) return;
        if (data?.status === 401) return;
        setRows(Array.isArray(data) ? data : []);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta verifikationer.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.tick]);

  async function openVoucher(id) {
    const v = await api.voucher(id);
    if (!v || v.ok === false) {
      setError(v?.error || "Verifikationen finns inte.");
      return;
    }
    setOpen(v);
  }

  async function reverse(id) {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await api.reverseVoucher(id, todayIso(state.year));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setMsg(`Rättelse bokförd som ${res.voucherNo}. Historik raderas inte.`);
    state.refresh();
  }

  return (
    <div className="stack">
      <div>
        <h2>Verifikationer</h2>
        <p className="lede">
          Grundbok i tidsordning. Verifikationer raderas inte — bokför en rättelse i en öppen period.
        </p>
      </div>
      {error && <p className="stamp" role="alert">{error}</p>}
      {msg && <p className="ledger">{msg}</p>}
      <div className="table-wrap">
        <table className="data" style={{ minWidth: "45rem" }}>
          <thead>
            <tr><th>Nr</th><th>Datum</th><th>Text</th><th className="right">Debet</th><th className="right">Kredit</th><th>Balans</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted">Inga verifikationer i år. Bokför från underlag.</td></tr>
            )}
            {rows.map((v) => {
              const balanced = toOre(v.debit) === toOre(v.credit);
              return (
                <tr key={v.id}>
                  <td><button type="button" className="btn btn-ghost" onClick={() => openVoucher(v.id)}>{v.voucherNo}</button></td>
                  <td className="tabular">{v.date}</td>
                  <td>{v.text}</td>
                  <td className="right tabular">{formatSek(v.debit)}</td>
                  <td className="right tabular">{formatSek(v.credit)}</td>
                  <td className={balanced ? "ledger" : "stamp"}>{balanced ? "Ja" : "Nej"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open?.lines && (
        <article className="card">
          <h3>{open.voucherNo} · {open.text}</h3>
          <p className="muted">{open.date}</p>
          <table className="data" style={{ marginTop: "0.75rem", minWidth: 0, boxShadow: "none" }}>
            <thead><tr><th>Konto</th><th className="right">Debet</th><th className="right">Kredit</th></tr></thead>
            <tbody>
              {open.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.account} {l.name}</td>
                  <td className="right tabular">{l.debit === 0 ? "" : formatSek(l.debit)}</td>
                  <td className="right tabular">{l.credit === 0 ? "" : formatSek(l.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="templates">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => reverse(open.id)}>Bokför rättelse</button>
          </div>
        </article>
      )}
    </div>
  );
}
