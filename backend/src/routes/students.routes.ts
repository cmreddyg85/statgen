import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { getActor, requireAuth, requireRole } from '../middleware/auth.js';
import { body, queryParams, routeParams, validate } from '../middleware/validate.js';
import * as recordService from '../services/student-record.service.js';
import * as studentService from '../services/student.service.js';
import {
  createStudentSchema,
  listStudentsQuerySchema,
  recordParamsSchema,
  statementPdfSchema,
  studentRecordSchema,
  updateStudentSchema,
  uuidParamSchema,
} from '../validation/schemas.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest } from '../utils/errors.js';

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
function parseRecordBody(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }

  recordUpload.single('file')(req, res, (error: unknown) => {
    if (error) {
      const code = (error as { code?: string }).code;
      next(
        code === 'LIMIT_FILE_SIZE'
          ? badRequest('The statement PDF must be 25 MB or smaller.')
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
    // Every record keeps the page it was generated from.
    if (!attachment) throw badRequest('The bank statement first page is required.');

    const record = await recordService.create(
      id,
      { ...body<RecordBody>(req), attachment },
      getActor(req),
    );
    res.status(201).json({ record });
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
    const record = await recordService.update(
      id,
      recordId,
      { ...body<RecordBody>(req), attachment: attachmentFrom(req) },
      getActor(req),
    );
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

/** POST /api/v1/students/:id/records/:recordId/finalize */
studentsRouter.post(
  '/:id/records/:recordId/finalize',
  validate(recordParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id, recordId } = routeParams<{ id: string; recordId: string }>(req);
    res.json({ record: await recordService.finalize(id, recordId, getActor(req)) });
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
