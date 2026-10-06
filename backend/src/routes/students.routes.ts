import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { getActor, requireAuth, requireRole } from '../middleware/auth.js';
import { body, queryParams, routeParams, validate } from '../middleware/validate.js';
import * as recordService from '../services/student-record.service.js';
import * as studentService from '../services/student.service.js';
import {
  createStudentSchema,
  emailRecordSchema,
  matchTransactionsSchema,
  recordFileParamsSchema,
  listStudentsQuerySchema,
  recordAccountInfoSchema,
  recordExtractSchema,
  recordParamsSchema,
  statementPdfSchema,
  studentRecordSchema,
  updateStudentSchema,
  uuidParamSchema,
} from '../validation/schemas.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest } from '../utils/errors.js';
import type { RecordBank } from '../types.js';
import type { EmailInput } from '../email/output.js';

export const studentsRouter = Router();

// Students are shared between both roles (PRD section 5).
studentsRouter.use(requireAuth, requireRole('ADMIN', 'USER'));

/** GET /api/v1/students/stats */
studentsRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await studentService.stats(getActor(req)));
  }),
);

/** GET /api/v1/students */
studentsRouter.get(
  '/',
  validate(listStudentsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const options = queryParams<{
      page: number;
      pageSize: number;
      search?: string;
      status?: 'active' | 'archived' | 'all';
      createdBy?: string;
    }>(req);
    res.json(await studentService.list(options, getActor(req)));
  }),
);

/** POST /api/v1/students */
studentsRouter.post(
  '/',
  validate(createStudentSchema),
  asyncHandler(async (req, res) => {
    const payload = body<{
      name: string;
      mobileNumber: string;
      offerCompany: string | null;
      referredBy?: string | null;
    }>(req);
    const student = await studentService.create(payload, getActor(req));
    res.status(201).json({ student });
  }),
);

/** GET /api/v1/students/:id */
studentsRouter.get(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ student: await studentService.getById(id, getActor(req)) });
  }),
);

/** PATCH /api/v1/students/:id */
studentsRouter.patch(
  '/:id',
  validate(uuidParamSchema, 'params'),
  validate(updateStudentSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const changes = body<{
      name?: string;
      mobileNumber?: string;
      offerCompany?: string | null;
      referredBy?: string | null;
    }>(req);
    res.json({ student: await studentService.update(id, changes, getActor(req)) });
  }),
);

/** DELETE /api/v1/students/:id — archives the student. */
studentsRouter.delete(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await studentService.archive(id, getActor(req));
    res.json({ success: true });
  }),
);

/** DELETE /api/v1/students/:id/permanent — administrators only, irreversible. */
studentsRouter.delete(
  '/:id/permanent',
  requireRole('ADMIN'),
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await studentService.remove(id, getActor(req));
    res.json({ success: true });
  }),
);

/**
 * GET /api/v1/students/:id/delete-impact — administrators only: what a
 * permanent delete takes with it, for the confirmation dialog.
 */
studentsRouter.get(
  '/:id/delete-impact',
  requireRole('ADMIN'),
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await studentService.getById(id, getActor(req));
    const { rows } = await query<{ records: number; payments: number }>(
      `SELECT (SELECT count(*)::int FROM student_records WHERE student_id = $1) AS records,
              (SELECT count(*)::int FROM payments WHERE student_id = $1) AS payments`,
      [id],
    );
    res.json(rows[0]);
  }),
);

/** POST /api/v1/students/:id/unarchive — administrators only. */
studentsRouter.post(
  '/:id/unarchive',
  requireRole('ADMIN'),
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ student: await studentService.unarchive(id, getActor(req)) });
  }),
);

/**
 * Generated statements. Each row keeps the three payloads the SBI module
 * produced for one run of the Generate-record form.
 */
interface RecordBody {
  bank: RecordBank;
  input: Record<string, unknown>;
  extract: Record<string, unknown>;
  statement: Record<string, unknown>;
}

const recordUpload = multer({
  storage: multer.memoryStorage(),
  // The statement page is one PDF page; the three payloads travel as text
  // fields beside it and run to a megabyte or so.
  limits: { fileSize: 25 * 1024 * 1024, fieldSize: 25 * 1024 * 1024 },
});

/**
 * A record arrives as multipart — the statement page plus the three payloads
 * as JSON text fields — so the file is stored with the data that came from
 * it. Plain JSON is still accepted for an update that keeps its file.
 */
const parseRecordBody = parseMultipart(recordUpload.single('file'));

function parseMultipart(upload: ReturnType<typeof recordUpload.any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }

    upload(req, res, (error: unknown) => {
      if (error) {
        const code = (error as { code?: string }).code;
        next(
          code === 'LIMIT_FILE_SIZE'
            ? badRequest('Each file must be 25 MB or smaller.')
            : error,
        );
        return;
      }

      for (const key of ['input', 'extract', 'statement'] as const) {
        const raw = (req.body as Record<string, unknown>)?.[key];
        if (typeof raw !== 'string') continue;
        try {
          (req.body as Record<string, unknown>)[key] = JSON.parse(raw);
        } catch {
          next(badRequest(`The ${key} payload is not valid JSON.`));
          return;
        }
      }

      next();
    });
  };
}

/** The upload as the repository wants it, or null when none was sent. */
function attachmentFrom(req: Request) {
  if (!req.file) return null;
  return {
    buffer: req.file.buffer,
    name: req.file.originalname,
    type: req.file.mimetype || 'application/pdf',
  };
}

/** GET /api/v1/students/:id/records */
studentsRouter.get(
  '/:id/records',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ records: await recordService.list(id, getActor(req)) });
  }),
);

/** POST /api/v1/students/:id/records */
studentsRouter.post(
  '/:id/records',
  validate(uuidParamSchema, 'params'),
  parseRecordBody,
  validate(studentRecordSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const attachment = attachmentFrom(req);
    if (!attachment) {
      throw badRequest('The bank statement first page is required.');
    }

    const record = await recordService.create(
      id,
      { ...body<RecordBody>(req), attachment },
      getActor(req),
    );
    res.status(201).json({ record });
  }),
);

/** Email records: the emails as JSON in `input`, each one's file as `file_<index>`. */
const parseEmailBody = parseMultipart(recordUpload.any());

function emailUploads(req: Request) {
  const uploads = new Map<number, { buffer: Buffer; name: string; type: string }>();
  for (const file of (req.files as Express.Multer.File[] | undefined) ?? []) {
    const match = /^file_(\d+)$/.exec(file.fieldname);
    if (!match) continue;
    uploads.set(Number(match[1]), {
      buffer: file.buffer,
      name: file.originalname,
      type: file.mimetype || 'application/octet-stream',
    });
  }
  return uploads;
}

/** POST /api/v1/students/:id/email-records */
studentsRouter.post(
  '/:id/email-records',
  validate(uuidParamSchema, 'params'),
  parseEmailBody,
  validate(emailRecordSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const { input } = body<{ input: { emails: EmailInput[] } }>(req);
    const record = await recordService.saveEmail(id, null, input.emails, emailUploads(req), getActor(req));
    res.status(201).json({ record });
  }),
);

/** PUT /api/v1/students/:id/email-records/:recordId */
studentsRouter.put(
  '/:id/email-records/:recordId',
  validate(recordParamsSchema, 'params'),
  parseEmailBody,
  validate(emailRecordSchema),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    const { input } = body<{ input: { emails: EmailInput[] } }>(req);
    const record = await recordService.saveEmail(id, recordId, input.emails, emailUploads(req), getActor(req));
    res.json({ record });
  }),
);

/** GET /api/v1/students/:id/records/:recordId/files/:fileId — an email's attachment. */
studentsRouter.get(
  '/:id/records/:recordId/files/:fileId',
  validate(recordFileParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId, fileId } = routeParams<{ id: string; recordId: string; fileId: string }>(req);
    const file = await recordService.getFile(id, recordId, fileId, getActor(req));
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/["\r\n]/g, '')}"`);
    res.send(file.buffer);
  }),
);

/** GET /api/v1/students/:id/records/:recordId */
studentsRouter.get(
  '/:id/records/:recordId',
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({ record: await recordService.getById(id, recordId, getActor(req)) });
  }),
);

/** PUT /api/v1/students/:id/records/:recordId — replaces a regenerated run. */
studentsRouter.put(
  '/:id/records/:recordId',
  validate(recordParamsSchema, 'params'),
  parseRecordBody,
  validate(studentRecordSchema),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    // The bank is fixed when the record is created.
    const { bank: _bank, ...payload } = body<RecordBody>(req);
    const record = await recordService.update(
      id,
      recordId,
      { ...payload, attachment: attachmentFrom(req) },
      getActor(req),
    );
    res.json({ record });
  }),
);

/**
 * PUT /api/v1/students/:id/records/:recordId/extract — administrators only:
 * saves a corrected extract and regenerates the statement from it.
 */
studentsRouter.put(
  '/:id/records/:recordId/extract',
  requireRole('ADMIN'),
  validate(recordParamsSchema, 'params'),
  validate(recordExtractSchema),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    const { extract } = body<{ extract: Record<string, unknown> }>(req);
    const record = await recordService.updateExtract(id, recordId, extract, getActor(req));
    res.json({ record });
  }),
);

/**
 * PUT /api/v1/students/:id/records/:recordId/account-info — corrects the
 * statement's account block only; the transactions are left as generated.
 */
studentsRouter.put(
  '/:id/records/:recordId/account-info',
  validate(recordParamsSchema, 'params'),
  validate(recordAccountInfoSchema),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    const { accountInfo } = body<{ accountInfo: Record<string, string> }>(req);
    const record = await recordService.updateAccountInfo(id, recordId, accountInfo, getActor(req));
    res.json({ record });
  }),
);

/** GET /api/v1/students/:id/records/:recordId/attachment — the stored PDF. */
studentsRouter.get(
  '/:id/records/:recordId/attachment',
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    const attachment = await recordService.getAttachment(id, recordId, getActor(req));

    res.setHeader('Content-Type', attachment.type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.name.replace(/["\r\n]/g, '')}"`,
    );
    res.send(attachment.buffer);
  }),
);

/**
 * POST /api/v1/students/:id/records/:recordId/match-transactions — appends
 * one or two rows so a finalized statement closes on `amount`.
 */
studentsRouter.post(
  '/:id/records/:recordId/match-transactions',
  validate(recordParamsSchema, 'params'),
  validate(matchTransactionsSchema),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    const { amount } = body<{ amount: number }>(req);
    res.json(await recordService.matchClosingBalance(id, recordId, amount, getActor(req)));
  }),
);

/** POST /api/v1/students/:id/records/:recordId/finalize */
studentsRouter.post(
  '/:id/records/:recordId/finalize',
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({ record: await recordService.finalize(id, recordId, getActor(req)) });
  }),
);

/** POST /api/v1/students/:id/done — admin: mails all finalized records, stores done. */
studentsRouter.post(
  '/:id/done',
  requireRole('ADMIN'),
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await recordService.markStudentDone(id, getActor(req));
    res.json({ ok: true });
  }),
);

/** POST /api/v1/students/:id/records/:recordId/done — admin: marks done and mails the JSON. */
studentsRouter.post(
  '/:id/records/:recordId/done',
  requireRole('ADMIN'),
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({ record: await recordService.markDone(id, recordId, getActor(req)) });
  }),
);

/** POST /api/v1/students/:id/records/:recordId/unfinalize */
studentsRouter.post(
  '/:id/records/:recordId/unfinalize',
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({ record: await recordService.unfinalize(id, recordId, getActor(req)) });
  }),
);

/**
 * POST /api/v1/students/:id/records/:recordId/show-download — administrators
 * only: releases the clean statement of a finalized record to its owner.
 */
studentsRouter.post(
  '/:id/records/:recordId/show-download',
  requireRole('ADMIN'),
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({
      record: await recordService.setDownloadReleased(id, recordId, true, getActor(req)),
    });
  }),
);

/** POST /api/v1/students/:id/records/:recordId/hide-download — takes it back. */
studentsRouter.post(
  '/:id/records/:recordId/hide-download',
  requireRole('ADMIN'),
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({
      record: await recordService.setDownloadReleased(id, recordId, false, getActor(req)),
    });
  }),
);

/** POST /api/v1/students/:id/records/:recordId/statement-pdf */
studentsRouter.post(
  '/:id/records/:recordId/statement-pdf',
  validate(recordParamsSchema, 'params'),
  validate(statementPdfSchema),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    const options = body<{
      fromDate: string;
      toDate: string;
      dateOfStatement?: string;
      dummy: boolean;
      protect: boolean;
      password?: string;
    }>(req);

    const { pdf, fileName } = await recordService.statementPdf(
      id,
      recordId,
      options,
      getActor(req),
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdf);
  }),
);

/** DELETE /api/v1/students/:id/records/:recordId */
studentsRouter.delete(
  '/:id/records/:recordId',
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    await recordService.remove(id, recordId, getActor(req));
    res.json({ success: true });
  }),
);
