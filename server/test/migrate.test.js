import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret-32chars!!";
process.env.BOKFLODE_PASSWORD = "test-password";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bokflode-mig-"));
const file = path.join(tmp, "old.sqlite");
process.env.SQLITE_PATH = file;

const old = new DatabaseSync(file);
old.exec(`
  CREATE TABLE accounts (
    number TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    vat TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE periods (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (year, month)
  );
  CREATE TABLE vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    number INTEGER NOT NULL,
    voucher_no TEXT NOT NULL UNIQUE,
    voucher_date TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE voucher_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    account_number TEXT NOT NULL REFERENCES accounts(number),
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_date TEXT NOT NULL,
    kind TEXT NOT NULL,
    reference TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'inkommet',
    voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE reconciliations (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    kind TEXT NOT NULL,
    book_balance REAL NOT NULL,
    statement_balance REAL NOT NULL,
    ok INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (year, month, kind)
  );
  CREATE TABLE firm_settings (
    id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL,
    org_nr TEXT NOT NULL,
    vat_period TEXT NOT NULL DEFAULT 'manad',
    engagement TEXT NOT NULL
  );
  CREATE TABLE close_flags (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    flag TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (year, month, flag)
  );
`);
old.exec("INSERT INTO accounts (number, name, type, vat, sort_order) VALUES ('1930', 'Företagskonto', 'tillgang', NULL, 1)");
old.exec("INSERT INTO accounts (number, name, type, vat, sort_order) VALUES ('2010', 'Eget kapital', 'eget_kapital', NULL, 2)");
old.exec("INSERT INTO vouchers (id, year, number, voucher_no, voucher_date, text) VALUES (1, 2026, 1, '2026-001', '2026-01-02', 'Gammal post')");
old.exec("INSERT INTO voucher_lines (voucher_id, account_number, debit, credit, description) VALUES (1, '1930', 12.34, 0, 'REAL kronor')");
old.exec("INSERT INTO voucher_lines (voucher_id, account_number, debit, credit, description) VALUES (1, '2010', 0, 12.34, 'REAL kronor')");
old.exec("INSERT INTO documents (received_date, kind, reference, amount, status, note) VALUES ('2026-01-02', 'bank', 'Gammal', 12.34, 'bokfort', '')");
old.exec("INSERT INTO reconciliations (year, month, kind, book_balance, statement_balance, ok, note) VALUES (2026, 1, 'bank', 12.34, 12.34, 1, '')");
old.close();

const { connectDb, closeDb, get } = await import("../src/db.js");
const { getVoucher, listDocuments, listRecons } = await import("../src/accounting.js");

before(async () => {
  await connectDb();
});

after(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("befintlig REAL-databas migreras till INTEGER öre", () => {
  const type = get("SELECT type FROM pragma_table_info('voucher_lines') WHERE name = 'debit'");
  assert.equal(String(type.type).toUpperCase(), "INTEGER");
  const line = get("SELECT debit FROM voucher_lines WHERE account_number = '1930'");
  assert.equal(Number(line.debit), 1234);
  const v = getVoucher(1);
  assert.equal(v.debit, 12.34);
  assert.equal(v.credit, 12.34);
  const docs = listDocuments(2026, 1);
  assert.equal(docs[0].amount, 12.34);
  const rec = listRecons(2026, 1);
  assert.equal(rec[0].bookBalance, 12.34);
  assert.equal(rec[0].statementBalance, 12.34);
});
