const ACCOUNTS = [
  ["1510", "Kundfordringar", "tillgang", null, 10],
  ["1910", "Kassa", "tillgang", null, 20],
  ["1930", "Företagskonto", "tillgang", null, 30],
  ["2640", "Ingående moms", "tillgang", "25", 40],
  ["2010", "Eget kapital", "eget_kapital", null, 50],
  ["2091", "Årets resultat", "eget_kapital", null, 60],
  ["2440", "Leverantörsskulder", "skuld", null, 70],
  ["2610", "Utgående moms", "skuld", "25", 80],
  ["2650", "Redovisningskonto för moms", "skuld", null, 90],
  ["2710", "Personalskatt", "skuld", null, 100],
  ["2731", "Avräkning lagstadgade sociala avgifter", "skuld", null, 110],
  ["3010", "Försäljning varor 25 %", "intakt", "25", 120],
  ["3041", "Försäljning tjänster 25 %", "intakt", "25", 130],
  ["4010", "Inköp varor och material", "kostnad", "25", 140],
  ["5010", "Lokalhyra", "kostnad", "25", 150],
  ["5460", "Förbrukningsmaterial", "kostnad", "25", 160],
  ["6110", "Kontorsmateriel", "kostnad", "25", 170],
  ["6230", "Datakommunikation", "kostnad", "25", 180],
  ["6570", "Bankkostnader", "kostnad", null, 190],
  ["7010", "Löner", "kostnad", null, 200],
  ["7510", "Sociala avgifter", "kostnad", null, 210],
  ["8999", "Årets resultat", "kostnad", null, 220]
];

function insertVoucher(db, id, year, number, no, date, text, lines) {
  db.prepare(`
    INSERT INTO vouchers (id, year, number, voucher_no, voucher_date, text)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, year, number, no, date, text);
  const line = db.prepare(`
    INSERT INTO voucher_lines (voucher_id, account_number, debit, credit, description)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const [account, debit, credit, description] of lines) {
    line.run(id, account, debit, credit, description);
  }
}

export function seed(db) {
  const accountCount = db.prepare("SELECT COUNT(*) AS n FROM accounts").get().n;
  if (accountCount === 0) {
    const ins = db.prepare("INSERT INTO accounts (number, name, type, vat, sort_order) VALUES (?, ?, ?, ?, ?)");
    for (const row of ACCOUNTS) ins.run(...row);
  }

  if (!db.prepare("SELECT 1 FROM firm_settings WHERE id = 1").get()) {
    db.prepare(`
      INSERT INTO firm_settings (id, company_name, org_nr, vat_period, engagement)
      VALUES (1, ?, ?, ?, ?)
    `).run(
      "Havregård Handel AB",
      "559123-4567",
      "manad",
      "Löpande bokföring, momsredovisning och årsbokslut"
    );
  }

  const periodIns = db.prepare("INSERT OR IGNORE INTO periods (year, month, locked) VALUES (2026, ?, 0)");
  for (let m = 1; m <= 12; m++) periodIns.run(m);

  if (db.prepare("SELECT COUNT(*) AS n FROM vouchers").get().n === 0) {
    insertVoucher(db, 1, 2026, 1, "2026-001", "2026-01-02", "Ingående balans", [
      ["1930", 50000, 0, "Ingående saldo bank"],
      ["2010", 0, 50000, "Eget kapital"]
    ]);
    insertVoucher(db, 2, 2026, 2, "2026-002", "2026-03-12", "Försäljning kontant", [
      ["1930", 12500, 0, "Inbetalning"],
      ["3010", 0, 10000, "Försäljning exkl. moms"],
      ["2610", 0, 2500, "Utgående moms 25 %"]
    ]);
    insertVoucher(db, 3, 2026, 3, "2026-003", "2026-04-03", "Inköp material", [
      ["4010", 4000, 0, "Inköp exkl. moms"],
      ["2640", 1000, 0, "Ingående moms 25 %"],
      ["1930", 0, 5000, "Utbetalning"]
    ]);
    insertVoucher(db, 4, 2026, 4, "2026-004", "2026-08-01", "Lokalhyra augusti", [
      ["5010", 8000, 0, "Hyra exkl. moms"],
      ["2640", 2000, 0, "Ingående moms 25 %"],
      ["1930", 0, 10000, "Utbetalning"]
    ]);
    insertVoucher(db, 5, 2026, 5, "2026-005", "2026-08-15", "Bankavgift", [
      ["6570", 45, 0, "Bankavgift"],
      ["1930", 0, 45, "Utbetalning"]
    ]);
  }

  if (db.prepare("SELECT COUNT(*) AS n FROM documents").get().n === 0) {
    const byNo = Object.fromEntries(
      db.prepare("SELECT voucher_no, id FROM vouchers").all().map((v) => [v.voucher_no, v.id])
    );
    const ins = db.prepare(`
      INSERT INTO documents (id, received_date, kind, reference, amount, status, voucher_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    ins.run(1, "2026-01-02", "bank", "Ingående saldo", 50000, "bokfort", byNo["2026-001"], "Bankbesked januari");
    ins.run(2, "2026-03-12", "kvitto", "Kassa 312", 12500, "bokfort", byNo["2026-002"], "Kontantförsäljning");
    ins.run(3, "2026-04-03", "leverantorsfaktura", "LF-8841", 5000, "bokfort", byNo["2026-003"], "Material inköp");
    ins.run(4, "2026-08-01", "leverantorsfaktura", "Hyra-08", 10000, "bokfort", byNo["2026-004"], "Lokalhyra augusti");
    ins.run(5, "2026-08-15", "bank", "Avgift augusti", 45, "bokfort", byNo["2026-005"], "Bankavgift");
    ins.run(6, "2026-08-18", "leverantorsfaktura", "LF-9102", 3750, "inkommet", null, "Kontorsmateriel, 25 % moms");
    ins.run(7, "2026-08-21", "kvitto", "Kvitto-219", 89, "inkommet", null, "Förbrukningsmaterial");
    ins.run(8, "2026-08-22", "bank", "Kontoutdrag aug", 0, "inkommet", null, "Väntar på avstämning mot 1930");
  }
}
