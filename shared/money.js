/** Gemensamma beloppshjälpare. En sanning för round2 / toOre / fromOre / format. */

export const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December"
];

export const DOC_KINDS = [
  "leverantorsfaktura",
  "kundfaktura",
  "kvitto",
  "bank",
  "loneunderlag",
  "ovrigt"
];

export const RECON_KINDS = ["bank", "kund", "leverantor", "moms"];

export const RESULT_ACCOUNT = "2091";
export const EQUITY_ACCOUNT = "2010";

export function pad(n) {
  return String(n).padStart(2, "0");
}

function asNumber(n) {
  if (typeof n === "bigint") return Number(n);
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function round2(n) {
  return Math.round((asNumber(n) + Number.EPSILON) * 100) / 100;
}

/** Kronor (number) → heltal öre. */
export function toOre(n) {
  return Math.round(round2(n) * 100);
}

/** Heltal öre → kronor (2 decimaler). */
export function fromOre(ore) {
  return round2(Math.round(asNumber(ore)) / 100);
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

export function formatSek(n) {
  return Number(n).toLocaleString("sv-SE", { style: "currency", currency: "SEK" });
}

export function parseAmount(s) {
  const n = Number(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function todayIso(year) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  return `${y}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
