import cors from "cors";
import { Router } from "express";
import { query } from "../db/pool.js";
import { apiRateLimiter } from "../middleware/rate-limit.js";
import {
  renderIdbiStatement,
  renderStatement,
  type StatementPayload,
} from "../sbi/statement-render.js";
import { asyncHandler } from "../utils/async-handler.js";
import { badRequest, notFound } from "../utils/errors.js";

export const publicRouter = Router();

/**
 * No session needed: the five-digit student code is the only key. Only
 * students an admin set live are served; anyone else is a 404. A live
 * student without a finalized record for that bank gets the empty shape.
 * Callable from any origin: no cookies are involved, so `*` is safe here.
 */
publicRouter.get(
  "/:bank(sbi|idbi)-details/:code",
  cors(),
  apiRateLimiter,
  asyncHandler(async (req, res) => {
    const bank = req.params.bank!.toUpperCase();
    const code = req.params.code ?? "";
    if (!/^[1-9]\d{4}$/.test(code))
      throw badRequest("Student id must be 5 digits.");

    const { rows } = await query<{
      account_info: unknown;
      transactions: unknown;
    }>(
      `SELECT (r.statement_json -> 'accountInfo') AS account_info,
              r.statement_json -> 'transactions' AS transactions
         FROM students s
         LEFT JOIN student_records r
           ON r.student_id = s.id AND r.bank = $2 AND r.finalized_at IS NOT NULL
        WHERE s.student_code = $1 AND s.live AND s.archived_at IS NULL`,
      [code, bank],
    );
    if (rows.length === 0) throw notFound("Student is not live.");
    const row = rows[0];
    res.json({
      accountInfo: row?.account_info ?? {},
      transactions: row?.transactions ?? [],
    });
  }),
);

/**
 * YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD; null for anything
 * else, including dates that don't exist (2026-02-30).
 */
export function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ??
    /^(\d{2})([-/])(\d{2})\2(\d{4})$/.exec(value);
  if (!match) return null;
  const [y, m, d] =
    match.length === 4
      ? [match[1]!, match[2]!, match[3]!]
      : [match[4]!, match[3]!, match[1]!];
  const iso = `${y}-${m}-${d}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso)
    ? iso
    : null;
}

/**
 * The live student's finalized SBI or IDBI statement as a PDF, cut to
 * fromDate..toDate (query params, see toIsoDate for the formats). pwdProtected=true locks it
 * with the account's password when there is one; otherwise it is unprotected.
 */
publicRouter.get(
  "/:bank(sbi|idbi)-download/:code",
  cors({ exposedHeaders: ["Content-Disposition"] }),
  apiRateLimiter,
  asyncHandler(async (req, res) => {
    const bank = req.params.bank!.toUpperCase();
    const code = req.params.code ?? "";
    if (!/^[1-9]\d{4}$/.test(code))
      throw badRequest("Student id must be 5 digits.");
    const fromDate = toIsoDate(req.query.fromDate);
    const toDate = toIsoDate(req.query.toDate);
    if (!fromDate || !toDate)
      throw badRequest(
        "fromDate and toDate are required as valid dates: YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY.",
      );
    if (toDate < fromDate)
      throw badRequest("toDate cannot be before fromDate.");

    const { rows } = await query<{ statement: StatementPayload | null }>(
      `SELECT r.statement_json AS statement
         FROM students s
         LEFT JOIN student_records r
           ON r.student_id = s.id AND r.bank = $2 AND r.finalized_at IS NOT NULL
        WHERE s.student_code = $1 AND s.live AND s.archived_at IS NULL`,
      [code, bank],
    );
    if (rows.length === 0) throw notFound("Student is not live.");
    const statement = rows[0]!.statement;
    if (!statement) throw notFound(`No finalized ${bank} record for this student.`);

    // No password on the record means an unprotected file, not an error.
    const protect =
      req.query.pwdProtected === "true" &&
      Boolean(statement.accountInfo?.password?.trim());

    const render = bank === "IDBI" ? renderIdbiStatement : renderStatement;
    const { pdf, fileName } = await render(statement, {
      fromDate,
      toDate,
      protect,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdf);
  }),
);
