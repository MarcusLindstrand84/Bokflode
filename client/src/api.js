const authListeners = new Set();

export function onUnauthorized(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

function emitUnauthorized() {
  for (const fn of authListeners) fn();
}

async function request(path, options = {}) {
  const { headers, ...rest } = options;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: { "Content-Type": "application/json", ...(headers || {}) }
  });

  if (res.status === 401) {
    if (!path.startsWith("/auth/")) emitUnauthorized();
    const data = await res.json().catch(() => null);
    return { ok: false, status: 401, error: data?.error || "Inte inloggad." };
  }

  if (res.status === 403) {
    const data = await res.json().catch(() => null);
    return { ok: false, status: 403, error: data?.error || "Du saknar behörighet." };
  }

  if (res.status === 404) return null;
  if (res.status === 405) {
    const data = await res.json().catch(() => null);
    return { ok: false, status: 405, error: data?.error || "Åtgärden är inte tillåten." };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok && data && typeof data === "object") return data;
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => get("/health"),
  me: () => get("/auth/me"),
  login: (username, password) => post("/auth/login", { username, password }),
  logout: () => post("/auth/logout", {}),
  accounts: () => get("/accounts"),
  periods: (year) => get(`/periods?year=${year}`),
  workspace: (year) => get(`/workspace?year=${year}`),
  vouchers: (year) => get(`/vouchers?year=${year}`),
  voucher: (id) => get(`/vouchers/${id}`),
  createVoucher: (body) => post("/vouchers", body),
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
