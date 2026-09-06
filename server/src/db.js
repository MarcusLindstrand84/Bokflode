import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import { seed } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

export const SCHEMA_VERSION = 2;

export const dbStatus = {
  connected: false,
  engine: "SQLite",
  database: "bokflode",
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

export function closeDb() {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
  dbStatus.connected = false;
}

export function appendAudit(action, detail = "", ok = true) {
  try {
    run(
      "INSERT INTO audit_log (action, detail, ok) VALUES (?, ?, ?)",
      String(action ?? "").slice(0, 80),
      String(detail ?? "").slice(0, 500),
      ok ? 1 : 0
    );
  } catch (e) {
    console.error("Kunde inte skriva audit-logg:", e);
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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
  debit          INTEGER NOT NULL DEFAULT 0,
  credit         INTEGER NOT NULL DEFAULT 0,
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
  amount        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'inkommet',
  voucher_id    INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  note          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reconciliations (
  year               INTEGER NOT NULL,
  month              INTEGER NOT NULL,
  kind               TEXT NOT NULL,
  book_balance       INTEGER NOT NULL,
  statement_balance  INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ok     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS vouchers_date_idx ON vouchers (voucher_date, number);
CREATE INDEX IF NOT EXISTS voucher_lines_voucher_idx ON voucher_lines (voucher_id);
CREATE INDEX IF NOT EXISTS voucher_lines_account_idx ON voucher_lines (account_number);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status, received_date);
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at, id);
`;

function columnType(table, column) {
  const cols = all(`PRAGMA table_info(${table})`);
  const col = cols.find((c) => c.name === column);
  return (col?.type ?? "").toUpperCase();
}

function schemaVersion() {
  try {
    const row = get("SELECT value FROM schema_meta WHERE key = 'schema_version'");
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}

function setSchemaVersion(version) {
  run(
    "INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(version)
  );
}

function recreateIndexes() {
  const conn = getDb();
  conn.exec("CREATE INDEX IF NOT EXISTS vouchers_date_idx ON vouchers (voucher_date, number);");
  conn.exec("CREATE INDEX IF NOT EXISTS voucher_lines_voucher_idx ON voucher_lines (voucher_id);");
  conn.exec("CREATE INDEX IF NOT EXISTS voucher_lines_account_idx ON voucher_lines (account_number);");
  conn.exec("CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status, received_date);");
  conn.exec("CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at, id);");
}

/** Konverterar REAL-kronor till INTEGER öre på befintlig databas. Ny DB skapas redan som INTEGER. */
function migrateRealKronorToOre() {
  const debitType = columnType("voucher_lines", "debit");
  if (debitType === "INTEGER") return;

  const conn = getDb();
  conn.exec("PRAGMA foreign_keys = OFF;");
  try {
    conn.exec("BEGIN IMMEDIATE;");
    conn.exec(`
      CREATE TABLE voucher_lines_new (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id     INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        account_number TEXT NOT NULL REFERENCES accounts(number),
        debit          INTEGER NOT NULL DEFAULT 0,
        credit         INTEGER NOT NULL DEFAULT 0,
        description    TEXT NOT NULL DEFAULT ''
      );
    `);
    conn.exec(`
      INSERT INTO voucher_lines_new (id, voucher_id, account_number, debit, credit, description)
      SELECT id, voucher_id, account_number,
             CAST(ROUND(debit * 100) AS INTEGER),
             CAST(ROUND(credit * 100) AS INTEGER),
             description
      FROM voucher_lines;
    `);
    conn.exec("DROP TABLE voucher_lines;");
    conn.exec("ALTER TABLE voucher_lines_new RENAME TO voucher_lines;");

    conn.exec(`
      CREATE TABLE documents_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        received_date TEXT NOT NULL,
        kind          TEXT NOT NULL,
        reference     TEXT NOT NULL,
        amount        INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'inkommet',
        voucher_id    INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
        note          TEXT NOT NULL DEFAULT ''
      );
    `);
    conn.exec(`
      INSERT INTO documents_new (id, received_date, kind, reference, amount, status, voucher_id, note)
      SELECT id, received_date, kind, reference,
             CAST(ROUND(amount * 100) AS INTEGER),
             status, voucher_id, note
      FROM documents;
    `);
    conn.exec("DROP TABLE documents;");
    conn.exec("ALTER TABLE documents_new RENAME TO documents;");

    conn.exec(`
      CREATE TABLE reconciliations_new (
        year               INTEGER NOT NULL,
        month              INTEGER NOT NULL,
        kind               TEXT NOT NULL,
        book_balance       INTEGER NOT NULL,
        statement_balance  INTEGER NOT NULL,
        ok                 INTEGER NOT NULL,
        note               TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (year, month, kind)
      );
    `);
    conn.exec(`
      INSERT INTO reconciliations_new (year, month, kind, book_balance, statement_balance, ok, note)
      SELECT year, month, kind,
             CAST(ROUND(book_balance * 100) AS INTEGER),
             CAST(ROUND(statement_balance * 100) AS INTEGER),
             ok, note
      FROM reconciliations;
    `);
    conn.exec("DROP TABLE reconciliations;");
    conn.exec("ALTER TABLE reconciliations_new RENAME TO reconciliations;");

    conn.exec("COMMIT;");
  } catch (e) {
    try { conn.exec("ROLLBACK;"); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.exec("PRAGMA foreign_keys = ON;");
    recreateIndexes();
  }
}

function migrate() {
  if (schemaVersion() >= SCHEMA_VERSION) return;
  migrateRealKronorToOre();
  setSchemaVersion(SCHEMA_VERSION);
}

export async function connectDb() {
  const file = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(projectRoot, "data", "bokflode.sqlite");
  try {
    closeDb();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(SCHEMA);
    migrate();
    seed(db);
    dbStatus.connected = true;
    dbStatus.engine = "SQLite";
    dbStatus.database = "bokflode";
    dbStatus.error = null;
  } catch (e) {
    console.error("SQLite-anslutning misslyckades:", e);
    dbStatus.connected = false;
    dbStatus.error = "Databasen kunde inte öppnas.";
    dbStatus.database = "bokflode";
  }
}
