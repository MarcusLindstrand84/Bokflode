import { useEffect, useState } from "react";
import { api } from "../api.js";
import { docKindLabel, formatSek, parseAmount, pad, statusLabel } from "../money.js";
import { useWorkspace } from "../workspace.jsx";

function defaultDate(year, month) {
  const day = Math.min(22, new Date(year, month, 0).getDate());
  return `${year}-${pad(month)}-${pad(day)}`;
}

export default function DocumentsView() {
  const state = useWorkspace();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    date: defaultDate(state.year, state.month),
    kind: "leverantorsfaktura",
    reference: "",
    amount: "",
    note: ""
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.documents(state.year, state.month);
        if (cancelled) return;
        if (!Array.isArray(data)) {
          setError(data?.error || "Kunde inte hämta underlag.");
          setRows([]);
          return;
        }
        setRows(data);
        setError(null);
      } catch {
        if (!cancelled) setError("Kunde inte hämta underlag.");
      }
    })();
    return () => { cancelled = true; };
  }, [state.year, state.month, state.tick]);

  const open = rows.filter((r) => r.status === "inkommet").length;

  async function add(e) {
    e.preventDefault();
    const res = await api.addDocument({
      receivedDate: form.date,
      kind: form.kind,
      reference: form.reference,
      amount: parseAmount(form.amount),
      note: form.note
    });
    if (!res.ok) { setError(res.error || "Kunde inte spara underlaget."); return; }
    setForm((f) => ({ ...f, reference: "", amount: "", note: "" }));
    state.refresh();
  }

  function book(r) {
    state.book({
      documentId: r.id,
      date: r.receivedDate,
      text: r.reference,
      amount: r.amount,
      kind: r.kind
    });
  }

  async function missing(id) {
    await api.markMissing(id);
    state.refresh();
  }

  return (
    <div className="stack">
      <div>
        <h2>Underlag</h2>
        <p className="lede">Byrån bokför inte ur luften. Allt ska ha ett underlag. {open} obokade i perioden.</p>
      </div>

      <form onSubmit={add} className="card">
        <div className="doc-form">
          <label className="lbl">Datum
            <input className="field" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="lbl">Typ
            <select className="field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="leverantorsfaktura">Leverantörsfaktura</option>
              <option value="kundfaktura">Kundfaktura</option>
              <option value="kvitto">Kvitto</option>
              <option value="bank">Bank</option>
              <option value="loneunderlag">Löneunderlag</option>
              <option value="ovrigt">Övrigt</option>
            </select>
          </label>
          <label className="lbl">Referens
            <input className="field" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </label>
          <label className="lbl">Belopp
            <input className="field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary">Ta emot</button>
          <label className="lbl note">Notering
            <input className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
      </form>
      {error && <p className="stamp">{error}</p>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Datum</th><th>Typ</th><th>Referens</th><th className="right">Belopp</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted">Inga underlag i perioden.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="tabular">{r.receivedDate}</td>
                <td>{docKindLabel(r.kind)}</td>
                <td>
                  {r.reference}
                  {r.note ? <span className="muted" style={{ display: "block" }}>{r.note}</span> : null}
                </td>
                <td className="right tabular">{r.amount === 0 ? "—" : formatSek(r.amount)}</td>
                <td>{statusLabel(r.status)}</td>
                <td className="actions">
                  {r.status === "inkommet" && r.kind !== "bank" && (
                    <button type="button" className="btn btn-ghost" onClick={() => book(r)}>Bokför underlag</button>
                  )}
                  {r.status === "inkommet" && (
                    <button type="button" className="btn btn-text-danger" onClick={() => missing(r.id)}>Saknas</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
