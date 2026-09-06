import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useWorkspace } from "../workspace.jsx";

export default function EngagementView({ onSaved }) {
  const state = useWorkspace();
  const [draft, setDraft] = useState({
    companyName: "",
    orgNr: "",
    vatPeriod: "manad",
    engagement: ""
  });
  const [conn, setConn] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const firm = await api.firm();
      setDraft({
        companyName: firm.companyName,
        orgNr: firm.orgNr,
        vatPeriod: firm.vatPeriod,
        engagement: firm.engagement
      });
      setConn(await api.health());
    })();
  }, []);

  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api.saveFirm(draft);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setMsg("Uppdraget är uppdaterat.");
    state.refresh();
    await onSaved?.();
  }

  return (
    <div className="grid-2">
      <form onSubmit={save} className="stack">
        <div>
          <h2>Uppdrag</h2>
          <p className="lede">Första steget i byrån: vem klienten är, vilket uppdrag som gäller och hur momsen redovisas.</p>
        </div>
        <label className="lbl">Klient (firma)
          <input className="field" value={draft.companyName} onChange={(e) => setField("companyName", e.target.value)} />
        </label>
        <label className="lbl">Organisationsnummer
          <input className="field" value={draft.orgNr} onChange={(e) => setField("orgNr", e.target.value)} />
        </label>
        <label className="lbl">Momsperiod
          <select className="field" value={draft.vatPeriod} onChange={(e) => setField("vatPeriod", e.target.value)}>
            <option value="manad">Månad</option>
            <option value="kvartal">Kvartal</option>
          </select>
        </label>
        <label className="lbl">Uppdragets omfattning
          <input className="field" value={draft.engagement} onChange={(e) => setField("engagement", e.target.value)} />
        </label>
        {error && <p className="stamp">{error}</p>}
        {msg && <p className="ledger">{msg}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>Spara uppdrag</button>
      </form>

      <section className="card stack-sm">
        <h3>SQLite</h3>
        {!conn ? (
          <p className="muted">Hämtar databasstatus…</p>
        ) : (
          <>
            <p className="muted">All bokföring sparas i en lokal SQLite-fil. Samma regler som i byrån: debet = kredit, underlag före bokföring, bankavstämning före lås.</p>
            <ul className="stack-sm" style={{ fontSize: "0.875rem", listStyle: "none", padding: 0, margin: "0.25rem 0 0" }}>
              <li>Motor: {conn.engine}</li>
              <li>Fil: {conn.server}</li>
              <li>Konton: {conn.accountCount}</li>
              <li>Verifikationer: {conn.voucherCount}</li>
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
