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
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.vouchers(state.year);
        if (cancelled) return;
        setRows(data);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta verifikationer.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.tick]);

  async function openVoucher(id) {
    setOpen(await api.voucher(id));
    setConfirmId(null);
  }

  async function reverse(id) {
    setBusy(true);
    setError(null);
    const res = await api.reverseVoucher(id, todayIso(state.year));
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    state.refresh();
  }

  async function remove(id) {
    setBusy(true);
    setError(null);
    const res = await api.deleteVoucher(id);
    setBusy(false);
    if (!res.ok) { setError(res.error); setConfirmId(null); return; }
    setConfirmId(null);
    if (open?.id === id) setOpen(null);
    setMsg(`${res.voucherNo} är borttagen.`);
    state.refresh();
  }

  return (
    <div className="stack">
      <div>
        <h2>Verifikationer</h2>
        <p className="lede">Grundbok i tidsordning. Felbokning i öppen period kan tas bort. I låst period bokförs en rättelse i stället.</p>
      </div>
      {error && <p className="stamp">{error}</p>}
      {msg && <p className="ledger">{msg}</p>}
      <div className="table-wrap">
        <table className="data" style={{ minWidth: "45rem" }}>
          <thead>
            <tr><th>Nr</th><th>Datum</th><th>Text</th><th className="right">Debet</th><th className="right">Kredit</th><th>Balans</th><th>Åtgärd</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="muted">Inga verifikationer i år. Bokför från underlag.</td></tr>
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
                  <td className="actions">
                    {confirmId === v.id ? (
                      <>
                        <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(v.id)}>Bekräfta</button>
                        <button type="button" className="btn btn-ghost" onClick={() => setConfirmId(null)}>Avbryt</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-text-danger" disabled={busy} onClick={() => setConfirmId(v.id)}>Ta bort</button>
                    )}
                  </td>
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
            {confirmId === open.id ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(open.id)}>Bekräfta borttagning</button>
            ) : (
              <button type="button" className="btn btn-text-danger" disabled={busy} onClick={() => setConfirmId(open.id)}>Ta bort</button>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
