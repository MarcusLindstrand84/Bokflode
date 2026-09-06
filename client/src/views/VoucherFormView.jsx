import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { formatSek, parseAmount, round2, toOre } from "../money.js";
import { useWorkspace } from "../workspace.jsx";
import Icon from "../components/Icon.jsx";

const TEMPLATES = [
  { id: "sale", label: "Försäljning kontant 25 %" },
  { id: "saleinv", label: "Försäljning faktura 25 %" },
  { id: "buy", label: "Inköp kontant 25 %" },
  { id: "buyinv", label: "Inköp faktura 25 %" },
  { id: "paycust", label: "Kundinbetalning" },
  { id: "paysup", label: "Leverantörsbetalning" },
  { id: "rent", label: "Hyra 25 %" },
  { id: "bank", label: "Bankavgift" }
];

function L(account, debit, credit) {
  return { account, debit, credit };
}

export default function VoucherFormView() {
  const state = useWorkspace();
  const [accounts, setAccounts] = useState([]);
  const [voucherDate, setVoucherDate] = useState(`${state.year}-08-22`);
  const [text, setText] = useState("");
  const [documentId, setDocumentId] = useState(null);
  const [lines, setLines] = useState([L("1930", "", ""), L("3010", "", "")]);
  const [templateAmt, setTemplateAmt] = useState("1000");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const applied = useRef(null);

  useEffect(() => {
    api.accounts().then((data) => setAccounts(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    const p = state.prefill;
    if (!p || applied.current === p.documentId) return;
    applied.current = p.documentId;
    if (p.date) setVoucherDate(p.date);
    setText(p.text);
    setDocumentId(p.documentId);
    if (p.amount > 0) setTemplateAmt(String(p.amount));
    const tot = round2(p.amount);
    const exkl = round2(tot / 1.25);
    const vat = round2(tot - exkl);
    const totS = String(tot);
    const exklS = String(exkl);
    const vatS = String(vat);
    if (p.kind === "leverantorsfaktura" || p.kind === "kvitto") {
      setLines([
        L(p.kind === "kvitto" ? "5460" : "6110", exklS, ""),
        L("2640", vatS, ""),
        L(p.kind === "kvitto" ? "1930" : "2440", "", totS)
      ]);
    } else if (p.kind === "kundfaktura") {
      setLines([
        L("1510", totS, ""),
        L("3010", "", exklS),
        L("2610", "", vatS)
      ]);
    }
  }, [state.prefill]);

  const totals = (() => {
    const d = round2(lines.reduce((s, l) => s + parseAmount(l.debit), 0));
    const c = round2(lines.reduce((s, l) => s + parseAmount(l.credit), 0));
    return { debit: d, credit: c, diff: round2(d - c) };
  })();
  const balanced = toOre(totals.debit) === toOre(totals.credit) && totals.debit > 0;

  function applyTemplate(id) {
    const exkl = parseAmount(templateAmt);
    if (exkl <= 0) {
      setError("Ange ett belopp exklusive moms.");
      return;
    }
    const vat = round2(exkl * 0.25);
    const tot = round2(exkl + vat);
    const e = String(exkl);
    const v = String(vat);
    const t = String(tot);
    switch (id) {
      case "sale":
        setText("Försäljning kontant");
        setLines([L("1930", t, ""), L("3010", "", e), L("2610", "", v)]);
        break;
      case "saleinv":
        setText("Försäljning faktura");
        setLines([L("1510", t, ""), L("3010", "", e), L("2610", "", v)]);
        break;
      case "buy":
        setText("Inköp material");
        setLines([L("4010", e, ""), L("2640", v, ""), L("1930", "", t)]);
        break;
      case "buyinv":
        setText("Inköp faktura");
        setLines([L("4010", e, ""), L("2640", v, ""), L("2440", "", t)]);
        break;
      case "paycust":
        setText("Kundinbetalning");
        setLines([L("1930", e, ""), L("1510", "", e)]);
        break;
      case "paysup":
        setText("Leverantörsbetalning");
        setLines([L("2440", e, ""), L("1930", "", e)]);
        break;
      case "rent":
        setText("Lokalhyra");
        setLines([L("5010", e, ""), L("2640", v, ""), L("1930", "", t)]);
        break;
      default:
        setText("Bankavgift");
        setLines([L("6570", e, ""), L("1930", "", e)]);
        break;
    }
    setError(null);
  }

  function setAccount(i, value) {
    setLines((rows) => rows.map((l, idx) => idx === i ? { ...l, account: value } : l));
  }
  function setDebit(i, value) {
    setLines((rows) => rows.map((l, idx) => idx === i ? { ...l, debit: value, credit: value ? "" : l.credit } : l));
  }
  function setCredit(i, value) {
    setLines((rows) => rows.map((l, idx) => idx === i ? { ...l, credit: value, debit: value ? "" : l.debit } : l));
  }
  function remove(i) {
    setLines((rows) => rows.length > 2 ? rows.filter((_, idx) => idx !== i) : rows);
  }
  function addLine() {
    setLines((rows) => [...rows, L(accounts[0]?.number ?? "1930", "", "")]);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await api.createVoucher({
        date: voucherDate,
        text,
        lines: lines.map((l) => ({ account: l.account, debit: parseAmount(l.debit), credit: parseAmount(l.credit) })),
        documentId
      });
      if (!res.ok) { setError(res.error); return; }
      setStatus(`Sparad som ${res.voucherNo}.`);
      setText("");
      setDocumentId(null);
      state.setPrefill(null);
      applied.current = null;
      setLines([L("1930", "", ""), L("3010", "", "")]);
      state.go("verifikationer");
      state.refresh();
    } catch {
      setError("Kunde inte spara verifikationen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <h2>Ny verifikation</h2>
        <p className="lede">Minst två rader. Debet och kredit måste summera lika.</p>
      </div>

      <div className="card">
        <p style={{ fontSize: "0.875rem", fontWeight: 600 }}>Mallar</p>
        <div className="templates">
          <label className="lbl">Belopp (exkl. moms på mallar med moms)
            <input className="field" style={{ width: "9rem" }} inputMode="decimal" value={templateAmt} onChange={(e) => setTemplateAmt(e.target.value)} />
          </label>
          {TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="btn btn-paper" onClick={() => applyTemplate(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <label className="lbl">Datum
          <input className="field" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
        </label>
        <label className="lbl">Text
          <input className="field" maxLength={200} required placeholder="Vad hände?" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Konto</th><th className="right">Debet</th><th className="right">Kredit</th><th></th></tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <select className="field" value={line.account} onChange={(e) => setAccount(idx, e.target.value)}>
                    {accounts.map((a) => (
                      <option key={a.number} value={a.number}>{a.number} {a.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="field right tabular" inputMode="decimal" value={line.debit} onChange={(e) => setDebit(idx, e.target.value)} />
                </td>
                <td>
                  <input className="field right tabular" inputMode="decimal" value={line.credit} onChange={(e) => setCredit(idx, e.target.value)} />
                </td>
                <td>
                  <button type="button" className="btn btn-text-danger" disabled={lines.length <= 2} onClick={() => remove(idx)} aria-label="Ta bort rad">
                    <Icon name="trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={addLine}>Lägg till rad</button>
        <p className={`tabular ${balanced ? "ledger" : "stamp"}`} style={{ fontSize: "0.875rem" }}>
          Debet {formatSek(totals.debit)} · Kredit {formatSek(totals.credit)}
          {balanced ? " · i balans" : ` · skiljer ${formatSek(Math.abs(totals.diff))}`}
        </p>
      </div>

      {error && <p className="stamp">{error}</p>}
      {status && <p className="ledger">{status}</p>}

      <button type="submit" className="btn btn-primary" disabled={busy || !balanced}>
        {busy ? "Sparar…" : "Spara och postera"}
      </button>
    </form>
  );
}
