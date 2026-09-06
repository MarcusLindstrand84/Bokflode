async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok && data && typeof data === "object") return data;
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });
const del = (path) => request(path, { method: "DELETE" });

export const api = {
  health: () => get("/health"),
  accounts: () => get("/accounts"),
  periods: (year) => get(`/periods?year=${year}`),
  workspace: (year) => get(`/workspace?year=${year}`),
  vouchers: (year) => get(`/vouchers?year=${year}`),
  voucher: (id) => get(`/vouchers/${id}`),
  createVoucher: (body) => post("/vouchers", body),
  deleteVoucher: (id) => del(`/vouchers/${id}`),
  reverseVoucher: (id, date) => post(`/vouchers/${id}/reverse`, { date }),
  ledger: (year, account) => get(`/ledger?year=${year}${account ? `&account=${encodeURIComponent(account)}` : ""}`),
  reports: (year) => get(`/reports?year=${year}`),
  settleVat: (year, date) => post("/vat/settle", { year, date }),
  closePeriod: (year, month) => post("/periods/close", { year, month }),
  yearEnd: (year) => post("/year-end", { year }),
  firm: () => get("/firm"),
  saveFirm: (body) => post("/firm", body),
  documents: (year, month) => get(`/documents?year=${year}&month=${month}`),
  addDocument: (body) => post("/documents", body),
  markMissing: (id) => post(`/documents/${id}/missing`),
  reconciliations: (year, month) => get(`/reconciliations?year=${year}&month=${month}`),
  saveRecon: (body) => post("/reconciliations", body),
  pipeline: (year, month) => get(`/pipeline?year=${year}&month=${month}`),
  closeFlag: (body) => post("/close-flags", body)
};
