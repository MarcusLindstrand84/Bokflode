import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret-32chars!!";
process.env.BOKFLODE_PASSWORD = "test-password";
process.env.BOKFLODE_USER = "bokflode";
process.env.HOST = "127.0.0.1";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bokflode-"));
process.env.SQLITE_PATH = path.join(tmp, "test.sqlite");

const { connectDb, closeDb, get } = await import("../src/db.js");
const accounting = await import("../src/accounting.js");
const { createApp } = await import("../src/app.js");

let server;
let base;

function cookieHeader(res) {
  const cookies = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "bokflode", password: "test-password" })
  });
  assert.equal(res.status, 200);
  return cookieHeader(res);
}

async function api(pathname, { method = "GET", cookie = "", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

before(async () => {
  await connectDb();
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("postVoucher: balans OK", () => {
  const res = accounting.createVoucher("2026-06-10", "Test i balans", [
    { account: "6570", debit: 80, credit: 0, description: "Avgift" },
    { account: "1930", debit: 0, credit: 80, description: "Bank" }
  ]);
  assert.equal(res.ok, true);
  assert.match(res.voucherNo, /^2026-/);
  const v = accounting.getVoucher(res.id);
  assert.equal(v.debit, 80);
  assert.equal(v.credit, 80);
  const raw = get("SELECT debit FROM voucher_lines WHERE voucher_id = ? AND account_number = '6570'", res.id);
  assert.equal(Number(raw.debit), 8000);
});

test("postVoucher: obalans fail", () => {
  const res = accounting.createVoucher("2026-06-11", "Test obalans", [
    { account: "6570", debit: 80, credit: 0 },
    { account: "1930", debit: 0, credit: 50 }
  ]);
  assert.equal(res.ok, false);
  assert.match(res.error, /Obalans/);
});

test("postVoucher: okänt underlag fail", () => {
  const res = accounting.createVoucher("2026-06-12", "Saknat underlag", [
    { account: "6570", debit: 10, credit: 0 },
    { account: "1930", debit: 0, credit: 10 }
  ], 999999);
  assert.equal(res.ok, false);
  assert.match(res.error, /Underlaget finns inte/);
});

test("reverseVoucher speglar rader", () => {
  const created = accounting.createVoucher("2026-06-13", "Att rätta", [
    { account: "6570", debit: 25.5, credit: 0, description: "Original" },
    { account: "1930", debit: 0, credit: 25.5, description: "Original" }
  ]);
  assert.equal(created.ok, true);
  const reversed = accounting.reverseVoucher(created.id, "2026-06-14");
  assert.equal(reversed.ok, true);
  const orig = accounting.getVoucher(created.id);
  const corr = accounting.getVoucher(reversed.id);
  assert.equal(corr.lines.length, orig.lines.length);
  for (let i = 0; i < orig.lines.length; i++) {
    assert.equal(corr.lines[i].account, orig.lines[i].account);
    assert.equal(corr.lines[i].debit, orig.lines[i].credit);
    assert.equal(corr.lines[i].credit, orig.lines[i].debit);
  }
});

test("addDocument: okänd kind fail", () => {
  const res = accounting.addDocument("2026-06-15", "moms", "X-1", 100, "");
  assert.equal(res.ok, false);
  assert.match(res.error, /Okänd underlagstyp/);
});

test("bookBalance/saveRecon: okänd kind fail", () => {
  const res = accounting.saveRecon(2026, 6, "skatt", 0, "");
  assert.equal(res.ok, false);
  assert.match(res.error, /Okänd avstämningstyp/);
});

test("closePeriod: fail utan full avstämning", () => {
  const res = accounting.closePeriod(2026, 2);
  assert.equal(res.ok, false);
  assert.match(res.error, /avstämning/i);
});

test("closePeriod: fail med obokade underlag även om avstämning finns", () => {
  const sides = accounting.getBookSides(2026, 8);
  for (const kind of ["bank", "kund", "leverantor", "moms"]) {
    const saved = accounting.saveRecon(2026, 8, kind, sides[kind], "");
    assert.equal(saved.ok, true);
  }
  const pipe = accounting.getPipeline(2026, 8);
  assert.equal(pipe.canLock, false);
  const res = accounting.closePeriod(2026, 8);
  assert.equal(res.ok, false);
  assert.match(res.error, /obokade/);
});

test("closePeriod: OK när alla krav uppfyllda", () => {
  const sides = accounting.getBookSides(2026, 2);
  for (const kind of ["bank", "kund", "leverantor", "moms"]) {
    const saved = accounting.saveRecon(2026, 2, kind, sides[kind], "");
    assert.equal(saved.ok, true);
  }
  const pipe = accounting.getPipeline(2026, 2);
  assert.equal(pipe.canLock, true);
  const res = accounting.closePeriod(2026, 2);
  assert.equal(res.ok, true);
  const periods = accounting.listPeriods(2026);
  assert.equal(periods.find((p) => p.month === 2).locked, true);
});

test("postVoucher i låst period fail", () => {
  const res = accounting.createVoucher("2026-02-10", "I låst period", [
    { account: "6570", debit: 10, credit: 0 },
    { account: "1930", debit: 0, credit: 10 }
  ]);
  assert.equal(res.ok, false);
  assert.match(res.error, /låst/i);
});

test("yearEndClose bokför på 2091 och inte 2010", () => {
  const created = accounting.yearEndClose(2026);
  assert.equal(created.ok, true, created.error);
  const v = accounting.getVoucher(created.id);
  assert.ok(v.lines.some((l) => l.account === "2091"), "saknar konto 2091");
  assert.equal(
    v.lines.some((l) => l.account === "2010"),
    false,
    "årsavslut ska inte bokföra på 2010"
  );
  const raw = get("SELECT account_number FROM voucher_lines WHERE voucher_id = ?", created.id);
  assert.ok(raw);
});

test("auth: skyddad route ger 401 utan session", async () => {
  const res = await api("/api/accounts");
  assert.equal(res.status, 401);
  assert.equal(res.data.ok, false);
});

test("auth: skyddad route ger 200 med session", async () => {
  const cookie = await login();
  const res = await api("/api/accounts", { cookie });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
  assert.ok(res.data.some((a) => a.number === "2091"));
});

test("DELETE /api/vouchers/:id returnerar 405", async () => {
  const cookie = await login();
  const res = await api("/api/vouchers/1", { method: "DELETE", cookie });
  assert.equal(res.status, 405);
  assert.match(res.data.error, /raderas inte/i);
});

test("GET /api/health är öppen och läcker inte absolut sökväg", async () => {
  const res = await api("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.data.connected, true);
  assert.equal(res.data.engine, "SQLite");
  assert.equal(res.data.database, "bokflode");
  const blob = JSON.stringify(res.data);
  assert.equal(blob.includes(tmp), false);
  assert.equal(/[A-Za-z]:[\\/]/.test(blob), false);
  assert.equal(blob.includes("Users\\"), false);
});
