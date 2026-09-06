import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { seed } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

export const dbStatus = {
  connected: false,
  engine: "SQLite",
  server: "data/bokflode.sqlite",
  database: "bokflode.sqlite",
  error: null
};

let db = null;

export function getDb() {
  if (!db) throw new Error("Databasen är inte öppen.");
  return db;
}

export function all(sql, ...params) {
  return getDb().prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return getDb().prepare(sql).get(...params) ?? null;
}

export function run(sql, ...params) {
  return getDb().prepare(sql).run(...params);
}

export function withTx(fn) {
  const conn = getDb();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    try { conn.exec("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  number     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('tillgang', 'skuld', 'eget_kapital', 'intakt', 'kostnad')),
  vat        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS periods (
  year   INTEGER NOT NULL,
  month  INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  locked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS vouchers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  year         INTEGER NOT NULL,
  number       INTEGER NOT NULL,
  voucher_no   TEXT NOT NULL UNIQUE,
  voucher_date TEXT NOT NULL,
  text         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS voucher_lines (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id     INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL REFERENCES accounts(number),
  debit          REAL NOT NULL DEFAULT 0,
  credit         REAL NOT NULL DEFAULT 0,
  description    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS firm_settings (
  id           INTEGER PRIMARY KEY,
  company_name TEXT NOT NULL,
  org_nr       TEXT NOT NULL,
  vat_period   TEXT NOT NULL DEFAULT 'manad',
  engagement   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  received_date TEXT NOT NULL,
  kind          TEXT NOT NULL,
  reference     TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'inkommet',
  voucher_id    INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  note          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reconciliations (
  year               INTEGER NOT NULL,
  month              INTEGER NOT NULL,
  kind               TEXT NOT NULL,
  book_balance       REAL NOT NULL,
  statement_balance  REAL NOT NULL,
  ok                 INTEGER NOT NULL,
  note               TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (year, month, kind)
);

CREATE TABLE IF NOT EXISTS close_flags (
  year  INTEGER NOT NULL,
  month INTEGER NOT NULL,
  flag  TEXT NOT NULL,
  done  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (year, month, flag)
);

CREATE INDEX IF NOT EXISTS vouchers_date_idx ON vouchers (voucher_date, number);
CREATE INDEX IF NOT EXISTS voucher_lines_voucher_idx ON voucher_lines (voucher_id);
CREATE INDEX IF NOT EXISTS voucher_lines_account_idx ON voucher_lines (account_number);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status, received_date);
`;

export async function connectDb() {
  const file = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(projectRoot, "data", "bokflode.sqlite");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(SCHEMA);
    seed(db);
    const rel = path.relative(projectRoot, file);
    dbStatus.connected = true;
    dbStatus.engine = "SQLite";
    dbStatus.server = rel && !rel.startsWith("..") ? rel.replaceAll("\\", "/") : file;
    dbStatus.database = path.basename(file);
    dbStatus.error = null;
  } catch (e) {
    dbStatus.connected = false;
    dbStatus.error = e.message;
    dbStatus.server = file;
    dbStatus.database = path.basename(file);
  }
}
