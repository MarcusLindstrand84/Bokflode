export const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December"
];

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function toOre(n) {
  return Math.round(round2(n) * 100);
}

export function signedBalance(type, debit, credit) {
  return type === "tillgang" || type === "kostnad"
    ? round2(debit - credit)
    : round2(credit - debit);
}

export function tryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return value;
}

export function monthBounds(year, month) {
  const from = `${year}-${pad(month)}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${pad(month)}-${pad(last)}`;
  return { from, to };
}

export function formatAmount(n) {
  return round2(n).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function typeLabel(type) {
  switch (type) {
    case "tillgang": return "Tillgång";
    case "skuld": return "Skuld";
    case "eget_kapital": return "Eget kapital";
    case "intakt": return "Intäkt";
    case "kostnad": return "Kostnad";
    default: return type;
  }
}

export function docKindLabel(kind) {
  switch (kind) {
    case "leverantorsfaktura": return "Leverantörsfaktura";
    case "kundfaktura": return "Kundfaktura";
    case "kvitto": return "Kvitto";
    case "bank": return "Bank";
    case "loneunderlag": return "Löneunderlag";
    case "ovrigt": return "Övrigt";
    default: return kind;
  }
}

export function reconLabel(kind) {
  switch (kind) {
    case "bank": return "Bank (1910/1930)";
    case "kund": return "Kundreskontra (1510)";
    case "leverantor": return "Leverantörsreskontra (2440)";
    case "moms": return "Moms (2610−2640)";
    default: return kind;
  }
}

export function statusLabel(status) {
  switch (status) {
    case "bokfort": return "Bokfört";
    case "saknas": return "Saknas";
    default: return "Inkommet";
  }
}
