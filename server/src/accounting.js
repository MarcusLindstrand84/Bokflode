import { all, get, run, withTx, dbStatus } from "./db.js";
import {
  round2,
  toOre,
  signedBalance,
  tryDate,
  monthBounds,
  formatAmount
} from "./money.js";

const ok = (extra = {}) => ({ ok: true, error: null, ...extra });
const fail = (error) => ({ ok: false, error });

function ensurePeriods(year) {
  const ins = (month) => run("INSERT OR IGNORE INTO periods (year, month, locked) VALUES (?, ?, 0)", year, month);
  for (let m = 1; m <= 12; m++) ins(m);
}

function loadBalances(from, to) {
  const accounts = all("SELECT number, name, type, sort_order FROM accounts ORDER BY sort_order, number");
  const sums = all(`
    SELECT l.account_number AS account, SUM(l.debit) AS debit, SUM(l.credit) AS credit
    FROM voucher_lines l
    JOIN vouchers v ON v.id = l.voucher_id
    WHERE v.voucher_date >= ? AND v.voucher_date <= ?
    GROUP BY l.account_number
  `, from, to);
  const map = Object.fromEntries(sums.map((s) => [s.account, s]));
  return accounts.map((a) => {
    const s = map[a.number];
    const debit = round2(s?.debit ?? 0);
    const credit = round2(s?.credit ?? 0);
    return {
      number: a.number,
      name: a.name,
      type: a.type,
      debit,
      credit,
      balance: signedBalance(a.type, debit, credit)
    };
  });
}

function loadVouchers(year) {
  return all(`
    SELECT v.id, v.voucher_no AS voucherNo, v.voucher_date AS date, v.text,
           COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
    FROM vouchers v
    LEFT JOIN voucher_lines l ON l.voucher_id = v.id
    WHERE v.year = ?
    GROUP BY v.id
    ORDER BY v.number DESC
  `, year).map((r) => ({
    id: r.id,
    voucherNo: r.voucherNo,
    date: r.date,
    text: r.text,
    debit: round2(r.debit),
    credit: round2(r.credit)
  }));
}

function accountMap() {
  return Object.fromEntries(
    all("SELECT number, name, type FROM accounts").map((a) => [a.number, a])
  );
}

function bookBalance(year, month, kind) {
  const from = `${year}-01-01`;
  const { to } = monthBounds(year, month);
  const balances = loadBalances(from, to);
  const bal = (n) => balances.find((b) => b.number === n)?.balance ?? 0;
  switch (kind) {
    case "bank": return round2(bal("1910") + bal("1930"));
    case "kund": return bal("1510");
    case "leverantor": return bal("2440");
    default: return round2(bal("2610") - bal("2640"));
  }
}

function loadRecons(year, month) {
  return all(
    "SELECT kind, book_balance, statement_balance, ok, note FROM reconciliations WHERE year = ? AND month = ?",
    year, month
  ).map((r) => ({
    kind: r.kind,
    bookBalance: r.book_balance,
    statementBalance: r.statement_balance,
    ok: Boolean(r.ok),
    note: r.note
  }));
}

function mapDoc(d) {
  return {
    id: d.id,
    receivedDate: d.received_date,
    kind: d.kind,
    reference: d.reference,
    amount: d.amount,
    status: d.status,
    voucherId: d.voucher_id,
    note: d.note
  };
}

function postVoucher(date, text, rawLines, documentId) {
  text = (text ?? "").trim();
  if (text.length < 2 || text.length > 200) return fail("Texten måste vara 2–200 tecken.");
  if (!tryDate(date)) return fail("Ogiltigt datum.");
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lines = rawLines
    .map((l) => ({
      account: String(l.account ?? "").trim(),
      debit: round2(l.debit ?? 0),
      credit: round2(l.credit ?? 0),
      description: String(l.description ?? "").trim()
    }))
    .filter((l) => l.account && (l.debit > 0 || l.credit > 0));
  if (lines.length < 2) return fail("Minst två konteringsrader krävs.");
  for (const l of lines) {
    if (l.debit > 0 && l.credit > 0) return fail(`Konto ${l.account}: ange antingen debet eller kredit.`);
    if (l.debit < 0 || l.credit < 0) return fail("Belopp får inte vara negativa.");
  }
  const debit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credit = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (toOre(debit) !== toOre(credit)) {
    return fail(`Obalans: debet ${formatAmount(debit)} ≠ kredit ${formatAmount(credit)}.`);
  }

  ensurePeriods(year);
  const period = get("SELECT locked FROM periods WHERE year = ? AND month = ?", year, month);
  if (period?.locked) return fail("Perioden är låst. Rättelse bokförs i en öppen period.");

  const known = new Set(all("SELECT number FROM accounts").map((a) => a.number));
  for (const l of lines) {
    if (!known.has(l.account)) return fail(`Okänt konto ${l.account}.`);
  }

  const last = get("SELECT MAX(number) AS n FROM vouchers WHERE year = ?", year);
  const number = (last?.n ?? 0) + 1;
  const voucherNo = `${year}-${String(number).padStart(3, "0")}`;

  const id = withTx(() => {
    const info = run(
      "INSERT INTO vouchers (year, number, voucher_no, voucher_date, text) VALUES (?, ?, ?, ?, ?)",
      year, number, voucherNo, date, text
    );
    const voucherId = Number(info.lastInsertRowid);
    const insLine = (l) => run(
      "INSERT INTO voucher_lines (voucher_id, account_number, debit, credit, description) VALUES (?, ?, ?, ?, ?)",
      voucherId, l.account, l.debit, l.credit, l.description.slice(0, 120)
    );
    for (const l of lines) insLine(l);
    if (documentId != null) {
      run(
        "UPDATE documents SET status = 'bokfort', voucher_id = ? WHERE id = ? AND status = 'inkommet'",
        voucherId, documentId
      );
    }
    return voucherId;
  });

  return ok({ voucherNo, id });
}

export function getConnectionStatus() {
  let accountCount = 0;
  let voucherCount = 0;
  if (dbStatus.connected) {
    try {
      accountCount = get("SELECT COUNT(*) AS n FROM accounts").n;
      voucherCount = get("SELECT COUNT(*) AS n FROM vouchers").n;
    } catch (e) {
      dbStatus.connected = false;
      dbStatus.error = e.message;
    }
  }
  return {
    connected: dbStatus.connected,
    engine: dbStatus.engine,
    server: dbStatus.server,
    database: dbStatus.database,
    accountCount,
    voucherCount,
    error: dbStatus.error
  };
}

export function listAccounts() {
  return all("SELECT number, name, type, vat FROM accounts ORDER BY sort_order, number")
    .map((a) => ({ number: a.number, name: a.name, type: a.type, vat: a.vat }));
}

export function listPeriods(year) {
  ensurePeriods(year);
  return all("SELECT year, month, locked FROM periods WHERE year = ? ORDER BY month", year)
    .map((p) => ({ year: p.year, month: p.month, locked: Boolean(p.locked) }));
}

export function getWorkspace(year) {
  ensurePeriods(year);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const balances = loadBalances(from, to);
  const recent = loadVouchers(year);
  const count = recent.length;
  const bank = round2(balances.filter((b) => b.number === "1910" || b.number === "1930").reduce((s, b) => s + b.balance, 0));
  const equity = round2(balances.filter((b) => b.type === "eget_kapital").reduce((s, b) => s + b.balance, 0));
  const income = round2(balances.filter((b) => b.type === "intakt").reduce((s, b) => s + b.balance, 0));
  const expense = round2(balances.filter((b) => b.type === "kostnad" && b.number !== "8999").reduce((s, b) => s + b.balance, 0));
  const vatOut = balances.find((b) => b.number === "2610")?.balance ?? 0;
  const vatIn = balances.find((b) => b.number === "2640")?.balance ?? 0;
  const assets = round2(balances.filter((b) => b.type === "tillgang").reduce((s, b) => s + b.balance, 0));
  const liabilities = round2(balances.filter((b) => b.type === "skuld").reduce((s, b) => s + b.balance, 0));
  const omslutningDebet = round2(balances.reduce((s, b) => s + b.debit, 0));
  const omslutningKredit = round2(balances.reduce((s, b) => s + b.credit, 0));
  const result = round2(income - expense);
  const financing = round2(liabilities + equity + result);
  const yearSums = all(`
    SELECT v.id, SUM(l.debit) AS debit, SUM(l.credit) AS credit
    FROM vouchers v JOIN voucher_lines l ON l.voucher_id = v.id
    WHERE v.year = ?
    GROUP BY v.id
  `, year);
  const unbalancedCount = yearSums.filter((v) => toOre(v.debit) !== toOre(v.credit)).length;
  const periods = all("SELECT year, month, locked FROM periods WHERE year = ? ORDER BY month", year);
  return {
    year,
    voucherCount: count,
    bank,
    equity,
    result,
    vatToPay: round2(vatOut - vatIn),
    assets,
    liabilities,
    financing,
    equationOk: toOre(assets) === toOre(financing),
    omslutningDebet,
    omslutningKredit,
    omslutningOk: toOre(omslutningDebet) === toOre(omslutningKredit),
    unbalancedCount,
    periods: periods.map((p) => ({ year: p.year, month: p.month, locked: Boolean(p.locked) })),
    recent: recent.slice(0, 6)
  };
}

export function listVouchers(year) {
  return loadVouchers(year);
}

export function getVoucher(id) {
  const v = get("SELECT id, voucher_no, voucher_date, text FROM vouchers WHERE id = ?", id);
  if (!v) return null;
  const accounts = accountMap();
  const lines = all(
    "SELECT account_number, debit, credit, description FROM voucher_lines WHERE voucher_id = ? ORDER BY id",
    id
  ).map((l) => ({
    account: l.account_number,
    name: accounts[l.account_number]?.name ?? "",
    debit: l.debit,
    credit: l.credit,
    description: l.description
  }));
  return {
    id: v.id,
    voucherNo: v.voucher_no,
    date: v.voucher_date,
    text: v.text,
    debit: round2(lines.reduce((s, l) => s + l.debit, 0)),
    credit: round2(lines.reduce((s, l) => s + l.credit, 0)),
    lines
  };
}

export function createVoucher(date, text, lines, documentId) {
  return postVoucher(date, text, lines, documentId ?? null);
}

export function deleteVoucher(id) {
  const v = get("SELECT id, voucher_no, voucher_date FROM vouchers WHERE id = ?", id);
  if (!v) return fail("Verifikationen finns inte.");
  const year = Number(v.voucher_date.slice(0, 4));
  const month = Number(v.voucher_date.slice(5, 7));
  const period = get("SELECT locked FROM periods WHERE year = ? AND month = ?", year, month);
  if (period?.locked) {
    return fail("Perioden är låst. Ta inte bort — bokför en rättelse i en öppen period.");
  }
  withTx(() => {
    run("UPDATE documents SET voucher_id = NULL, status = 'inkommet' WHERE voucher_id = ?", v.id);
    run("DELETE FROM voucher_lines WHERE voucher_id = ?", v.id);
    run("DELETE FROM vouchers WHERE id = ?", v.id);
  });
  return ok({ voucherNo: v.voucher_no, id: v.id });
}

export function reverseVoucher(id, date) {
  const v = get("SELECT id, voucher_no FROM vouchers WHERE id = ?", id);
  if (!v) return fail("Verifikationen finns inte.");
  const lines = all(
    "SELECT account_number, debit, credit FROM voucher_lines WHERE voucher_id = ? ORDER BY id",
    id
  );
  if (lines.length < 2) return fail("Verifikationen saknar rader.");
  return postVoucher(
    date,
    `Rättelse av ${v.voucher_no}`,
    lines.map((l) => ({
      account: l.account_number,
      debit: l.credit,
      credit: l.debit,
      description: `Rättelse ${v.voucher_no}`
    })),
    null
  );
}

export function getLedger(year, account) {
  const accounts = accountMap();
  const rows = account
    ? all(`
        SELECT v.id AS voucher_id, v.voucher_no, v.voucher_date, v.text, v.number,
               l.account_number, l.debit, l.credit, l.id AS line_id
        FROM voucher_lines l
        JOIN vouchers v ON v.id = l.voucher_id
        WHERE v.year = ? AND l.account_number = ?
        ORDER BY l.account_number, v.voucher_date, v.number, l.id
      `, year, account)
    : all(`
        SELECT v.id AS voucher_id, v.voucher_no, v.voucher_date, v.text, v.number,
               l.account_number, l.debit, l.credit, l.id AS line_id
        FROM voucher_lines l
        JOIN vouchers v ON v.id = l.voucher_id
        WHERE v.year = ?
        ORDER BY l.account_number, v.voucher_date, v.number, l.id
      `, year);
  const running = {};
  return rows.map((r) => {
    const acc = accounts[r.account_number];
    const type = acc?.type ?? "";
    running[r.account_number] = round2(
      (running[r.account_number] ?? 0) + signedBalance(type, r.debit, r.credit)
    );
    return {
      voucherId: r.voucher_id,
      voucherNo: r.voucher_no,
      date: r.voucher_date,
      text: r.text,
      account: r.account_number,
      name: acc?.name ?? "",
      type,
      debit: r.debit,
      credit: r.credit,
      balance: running[r.account_number]
    };
  });
}

export function getReports(year, fromIso, toIso) {
  const from = tryDate(fromIso) ?? `${year}-01-01`;
  const to = tryDate(toIso) ?? `${year}-12-31`;
  const balances = loadBalances(from, to);
  const assets = balances.filter((b) => b.type === "tillgang" && b.balance !== 0);
  const liabilities = balances.filter((b) => b.type === "skuld" && b.balance !== 0);
  const equity = balances.filter((b) => b.type === "eget_kapital" && b.balance !== 0);
  const income = balances.filter((b) => b.type === "intakt" && b.balance !== 0);
  const expense = balances.filter((b) => b.type === "kostnad" && b.number !== "8999" && b.balance !== 0);
  const result = round2(
    income.reduce((s, b) => s + b.balance, 0) - expense.reduce((s, b) => s + b.balance, 0)
  );
  const vatOut = balances.find((b) => b.number === "2610")?.balance ?? 0;
  const vatIn = balances.find((b) => b.number === "2640")?.balance ?? 0;
  const omslutningDebet = round2(balances.reduce((s, b) => s + b.debit, 0));
  const omslutningKredit = round2(balances.reduce((s, b) => s + b.credit, 0));
  return {
    from,
    to,
    assets,
    liabilities,
    equity,
    income,
    expense,
    result,
    totalAssets: round2(assets.reduce((s, b) => s + b.balance, 0)),
    totalEquityLiabilities: round2(
      liabilities.reduce((s, b) => s + b.balance, 0)
      + equity.reduce((s, b) => s + b.balance, 0)
      + result
    ),
    vatOut,
    vatIn,
    vatToPay: round2(vatOut - vatIn),
    trial: balances.filter((b) => b.debit !== 0 || b.credit !== 0),
    omslutningDebet,
    omslutningKredit,
    omslutningOk: toOre(omslutningDebet) === toOre(omslutningKredit)
  };
}

export function settleVat(year, date) {
  if (!tryDate(date)) return fail("Ogiltigt datum.");
  const balances = loadBalances(`${year}-01-01`, date);
  const vatOut = balances.find((b) => b.number === "2610")?.balance ?? 0;
  const vatIn = balances.find((b) => b.number === "2640")?.balance ?? 0;
  if (toOre(vatOut) === 0 && toOre(vatIn) === 0) return fail("Ingen moms att avräkna.");
  const lines = [];
  if (vatOut > 0) lines.push({ account: "2610", debit: vatOut, credit: 0, description: "Nollställs" });
  if (vatOut < 0) lines.push({ account: "2610", debit: 0, credit: -vatOut, description: "Nollställs" });
  if (vatIn > 0) lines.push({ account: "2640", debit: 0, credit: vatIn, description: "Nollställs" });
  if (vatIn < 0) lines.push({ account: "2640", debit: -vatIn, credit: 0, description: "Nollställs" });
  const net = round2(vatOut - vatIn);
  if (net > 0) lines.push({ account: "2650", debit: 0, credit: net, description: "Moms att betala" });
  if (net < 0) lines.push({ account: "2650", debit: -net, credit: 0, description: "Moms att få tillbaka" });
  return postVoucher(date, "Momsavräkning", lines, null);
}

export function closePeriod(year, month) {
  if (month < 1 || month > 12) return fail("Ogiltig månad.");
  ensurePeriods(year);
  const period = get("SELECT locked FROM periods WHERE year = ? AND month = ?", year, month);
  if (!period) return fail("Ogiltig månad.");
  if (period.locked) return fail("Perioden är redan låst.");
  const { from, to } = monthBounds(year, month);
  const unbooked = get(
    "SELECT COUNT(*) AS n FROM documents WHERE status = 'inkommet' AND received_date >= ? AND received_date <= ?",
    from, to
  ).n;
  if (unbooked > 0) {
    return fail(`${unbooked} underlag är obokade. Bokför eller markera saknade innan lås.`);
  }
  const bank = get(
    "SELECT ok FROM reconciliations WHERE year = ? AND month = ? AND kind = 'bank'",
    year, month
  );
  if (!bank?.ok) return fail("Bankavstämning måste vara godkänd innan perioden låses.");
  run("UPDATE periods SET locked = 1 WHERE year = ? AND month = ?", year, month);
  return ok();
}

export function yearEndClose(year) {
  ensurePeriods(year);
  const dec = get("SELECT locked FROM periods WHERE year = ? AND month = 12", year);
  if (dec?.locked) return fail("December är låst — årsavslut redan stängt för nya poster.");
  const balances = loadBalances(`${year}-01-01`, `${year}-12-31`);
  const income = balances.filter((b) => b.type === "intakt" && b.balance !== 0);
  const expense = balances.filter((b) => b.type === "kostnad" && b.number !== "8999" && b.balance !== 0);
  if (income.length === 0 && expense.length === 0) return fail("Inget resultat att överföra.");
  const lines = [];
  for (const b of income) lines.push({ account: b.number, debit: b.balance, credit: 0, description: "Nollställs" });
  for (const b of expense) lines.push({ account: b.number, debit: 0, credit: b.balance, description: "Nollställs" });
  const result = round2(
    income.reduce((s, b) => s + b.balance, 0) - expense.reduce((s, b) => s + b.balance, 0)
  );
  if (result > 0) lines.push({ account: "2010", debit: 0, credit: result, description: "Årets vinst" });
  if (result < 0) lines.push({ account: "2010", debit: -result, credit: 0, description: "Årets förlust" });
  const created = postVoucher(`${year}-12-31`, "Årets resultatöverföring", lines, null);
  if (!created.ok) return created;
  run("UPDATE periods SET locked = 1 WHERE year = ? AND month = 12", year);
  return { ...created, amount: result };
}

export function getFirm() {
  const row = get("SELECT company_name, org_nr, vat_period, engagement FROM firm_settings WHERE id = 1");
  if (!row) {
    return { companyName: "Nytt bolag", orgNr: "", vatPeriod: "manad", engagement: "Löpande bokföring" };
  }
  return {
    companyName: row.company_name,
    orgNr: row.org_nr,
    vatPeriod: row.vat_period,
    engagement: row.engagement
  };
}

export function saveFirm(data) {
  const name = String(data.companyName ?? "").trim();
  const orgNr = String(data.orgNr ?? "").trim();
  const engagement = String(data.engagement ?? "").trim();
  if (name.length < 2) return fail("Företagsnamn saknas.");
  if (!/^\d{6}-\d{4}$/.test(orgNr)) return fail("Organisationsnummer ska vara ÅÅMMDD-NNNN.");
  if (engagement.length < 4) return fail("Uppdragsbeskrivning saknas.");
  const vatPeriod = data.vatPeriod === "kvartal" ? "kvartal" : "manad";
  run(`
    INSERT INTO firm_settings (id, company_name, org_nr, vat_period, engagement)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      company_name = excluded.company_name,
      org_nr = excluded.org_nr,
      vat_period = excluded.vat_period,
      engagement = excluded.engagement
  `, name, orgNr, vatPeriod, engagement);
  return ok();
}

export function listDocuments(year, month) {
  let from;
  let to;
  if (month) {
    ({ from, to } = monthBounds(year, month));
  } else {
    from = `${year}-01-01`;
    to = `${year}-12-31`;
  }
  const rows = all(
    "SELECT * FROM documents WHERE received_date >= ? AND received_date <= ? ORDER BY received_date, id",
    from, to
  );
  if (!month) rows.reverse();
  return rows.map(mapDoc);
}

export function addDocument(receivedDate, kind, reference, amount, note) {
  if (!tryDate(receivedDate)) return fail("Ogiltigt datum.");
  const r = String(reference ?? "").trim();
  if (r.length < 2) return fail("Referens saknas.");
  const n = String(note ?? "").trim();
  run(
    "INSERT INTO documents (received_date, kind, reference, amount, status, note) VALUES (?, ?, ?, ?, 'inkommet', ?)",
    receivedDate, kind, r.slice(0, 80), round2(amount ?? 0), n.slice(0, 160)
  );
  return ok();
}

export function markDocumentMissing(id) {
  run("UPDATE documents SET status = 'saknas' WHERE id = ? AND status = 'inkommet'", id);
  return ok();
}

export function getBookSides(year, month) {
  return {
    bank: bookBalance(year, month, "bank"),
    kund: bookBalance(year, month, "kund"),
    leverantor: bookBalance(year, month, "leverantor"),
    moms: bookBalance(year, month, "moms")
  };
}

export function listRecons(year, month) {
  return loadRecons(year, month);
}

export function saveRecon(year, month, kind, statementBalance, note) {
  const book = bookBalance(year, month, kind);
  const statement = round2(statementBalance);
  const isOk = toOre(book) === toOre(statement);
  let trimmed = String(note ?? "").trim();
  if (trimmed.length > 160) trimmed = trimmed.slice(0, 160);
  run(`
    INSERT INTO reconciliations (year, month, kind, book_balance, statement_balance, ok, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, month, kind) DO UPDATE SET
      book_balance = excluded.book_balance,
      statement_balance = excluded.statement_balance,
      ok = excluded.ok,
      note = excluded.note
  `, year, month, kind, book, statement, isOk ? 1 : 0, trimmed);
  return ok();
}

export function setCloseFlag(year, month, flag, done) {
  if (flag !== "rapporter" && flag !== "leverans") return fail("Okänd flagga.");
  run(`
    INSERT INTO close_flags (year, month, flag, done)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(year, month, flag) DO UPDATE SET done = excluded.done
  `, year, month, flag, done ? 1 : 0);
  return ok();
}

export function getPipeline(year, month) {
  const { from, to } = monthBounds(year, month);
  const unbooked = get(
    "SELECT COUNT(*) AS n FROM documents WHERE status = 'inkommet' AND received_date >= ? AND received_date <= ?",
    from, to
  ).n;
  const documentCount = get(
    "SELECT COUNT(*) AS n FROM documents WHERE received_date >= ? AND received_date <= ?",
    from, to
  ).n;
  const voucherCount = get(
    "SELECT COUNT(*) AS n FROM vouchers WHERE year = ? AND voucher_date >= ? AND voucher_date <= ?",
    year, from, to
  ).n;
  const recons = loadRecons(year, month);
  const byKind = Object.fromEntries(recons.map((r) => [r.kind, r]));
  const kindOk = (k) => Boolean(byKind[k]?.ok);
  const flags = all("SELECT flag, done FROM close_flags WHERE year = ? AND month = ?", year, month);
  const flagDone = (name) => flags.some((f) => f.flag === name && f.done);
  const period = get("SELECT locked FROM periods WHERE year = ? AND month = ?", year, month);
  const firmCount = get("SELECT COUNT(*) AS n FROM firm_settings").n;
  const steps = [
    { id: "uppdrag", label: "Uppdrag", done: firmCount > 0, hint: firmCount > 0 ? "Uppdrag sparat" : "Fyll i klient och uppdrag" },
    { id: "underlag", label: "Underlag", done: unbooked === 0 && documentCount > 0, hint: `${unbooked} obokade underlag` },
    { id: "bokfor", label: "Löpande bokföring", done: voucherCount > 0, hint: `${voucherCount} verifikationer i perioden` },
    { id: "avstamning", label: "Avstämning", done: kindOk("bank") && kindOk("kund") && kindOk("leverantor"), hint: kindOk("bank") ? "Bank avstämd" : "Bank ej avstämd" },
    { id: "moms", label: "Moms", done: kindOk("moms"), hint: kindOk("moms") ? "Momsavstämning klar" : "Moms ej avstämd" },
    { id: "avslut", label: "Periodavslut", done: period?.locked === true || period?.locked === 1, hint: period?.locked ? "Perioden låst" : "Öppen period" },
    { id: "kundrapport", label: "Kundrapport", done: flagDone("leverans"), hint: flagDone("leverans") ? "Levererad" : "Ej levererad" }
  ];
  return {
    unbooked,
    documentCount,
    voucherCount,
    bankOk: kindOk("bank"),
    arOk: kindOk("kund"),
    apOk: kindOk("leverantor"),
    vatOk: kindOk("moms"),
    locked: Boolean(period?.locked),
    reportsReviewed: flagDone("rapporter"),
    delivered: flagDone("leverans"),
    canLock: unbooked === 0 && kindOk("bank"),
    steps
  };
}
