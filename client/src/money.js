export const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December"
];

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function toOre(n) {
  return Math.round(round2(n) * 100);
}

export function formatSek(n) {
  return Number(n).toLocaleString("sv-SE", { style: "currency", currency: "SEK" });
}

export function parseAmount(s) {
  const n = Number(String(s ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function pad(n) {
  return String(n).padStart(2, "0");
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
