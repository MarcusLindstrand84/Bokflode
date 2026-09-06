import { Router } from "express";
import { dbStatus } from "./db.js";
import * as accounting from "./accounting.js";

export const router = Router();

function isProduction() {
  return process.env.NODE_ENV === "production";
}

const wrap = (fn) => async (req, res) => {
  try {
    const isHealth = req.path === "/health" || req.originalUrl.startsWith("/api/health");
    if (!dbStatus.connected && !isHealth) {
      return res.status(503).json({ ok: false, error: "Ingen databasanslutning." });
    }
    await fn(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      ok: false,
      error: isProduction() ? "Ett oväntat fel uppstod." : (e.message || "Ett oväntat fel uppstod.")
    });
  }
};

router.get("/health", wrap(async (_req, res) => {
  res.json(await accounting.getConnectionStatus());
}));

router.get("/accounts", wrap(async (_req, res) => {
  res.json(await accounting.listAccounts());
}));

router.get("/periods", wrap(async (req, res) => {
  res.json(await accounting.listPeriods(Number(req.query.year)));
}));

router.get("/workspace", wrap(async (req, res) => {
  res.json(await accounting.getWorkspace(Number(req.query.year)));
}));

router.get("/vouchers", wrap(async (req, res) => {
  res.json(await accounting.listVouchers(Number(req.query.year)));
}));

router.get("/vouchers/:id", wrap(async (req, res) => {
  const v = await accounting.getVoucher(Number(req.params.id));
  if (!v) return res.status(404).json({ ok: false, error: "Verifikationen finns inte." });
  res.json(v);
}));

router.post("/vouchers", wrap(async (req, res) => {
  const { date, text, lines, documentId } = req.body ?? {};
  res.json(await accounting.createVoucher(date, text, lines ?? [], documentId));
}));

router.delete("/vouchers/:id", (_req, res) => {
  res.status(405).json({
    ok: false,
    error: "Verifikationer raderas inte. Bokför en rättelse i en öppen period."
  });
});

router.post("/vouchers/:id/reverse", wrap(async (req, res) => {
  res.json(await accounting.reverseVoucher(Number(req.params.id), req.body?.date));
}));

router.get("/ledger", wrap(async (req, res) => {
  res.json(await accounting.getLedger(Number(req.query.year), req.query.account || null));
}));

router.get("/reports", wrap(async (req, res) => {
  res.json(await accounting.getReports(Number(req.query.year), req.query.from, req.query.to));
}));

router.post("/vat/settle", wrap(async (req, res) => {
  res.json(await accounting.settleVat(Number(req.body?.year), req.body?.date));
}));

router.post("/periods/close", wrap(async (req, res) => {
  res.json(await accounting.closePeriod(Number(req.body?.year), Number(req.body?.month)));
}));

router.post("/year-end", wrap(async (req, res) => {
  res.json(await accounting.yearEndClose(Number(req.body?.year)));
}));

router.get("/firm", wrap(async (_req, res) => {
  res.json(await accounting.getFirm());
}));

router.post("/firm", wrap(async (req, res) => {
  res.json(await accounting.saveFirm(req.body ?? {}));
}));

router.get("/documents", wrap(async (req, res) => {
  const month = req.query.month == null || req.query.month === "" ? null : Number(req.query.month);
  res.json(await accounting.listDocuments(Number(req.query.year), month));
}));

router.post("/documents", wrap(async (req, res) => {
  const b = req.body ?? {};
  res.json(await accounting.addDocument(b.receivedDate, b.kind, b.reference, b.amount, b.note ?? ""));
}));

router.post("/documents/:id/missing", wrap(async (req, res) => {
  res.json(await accounting.markDocumentMissing(Number(req.params.id)));
}));

router.get("/reconciliations", wrap(async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  res.json({
    sides: await accounting.getBookSides(year, month),
    saved: await accounting.listRecons(year, month)
  });
}));

router.post("/reconciliations", wrap(async (req, res) => {
  const b = req.body ?? {};
  res.json(await accounting.saveRecon(b.year, b.month, b.kind, b.statementBalance, b.note ?? ""));
}));

router.get("/pipeline", wrap(async (req, res) => {
  res.json(await accounting.getPipeline(Number(req.query.year), Number(req.query.month)));
}));

router.post("/close-flags", wrap(async (req, res) => {
  const b = req.body ?? {};
  res.json(await accounting.setCloseFlag(b.year, b.month, b.flag, b.done));
}));
