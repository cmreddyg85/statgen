import { Router } from 'express';
import { getActor, requireAuth, requireRole } from '../middleware/auth.js';
import { body, queryParams, routeParams, validate } from '../middleware/validate.js';
import * as studentService from '../services/student.service.js';
import * as recordService from '../services/student-record.service.js';
import {
  createStudentSchema,
  generateRecordsSchema,
  listRecordsQuerySchema,
  listStudentsQuerySchema,
  updateStudentSchema,
  uuidParamSchema,
} from '../validation/schemas.js';
import { asyncHandler } from '../utils/async-handler.js';

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
      verified?: boolean;
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
      companyVerified: boolean;
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

/**
 * GET /api/v1/students/:id/records — records generated for this student,
 * optionally narrowed to one module.
 */
studentsRouter.get(
  '/:id/records',
  validate(uuidParamSchema, 'params'),
  validate(listRecordsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const options = queryParams<{ page: number; pageSize: number; module?: string }>(req);
    res.json(await recordService.list(id, options, getActor(req)));
  }),
);

/** POST /api/v1/students/:id/records/generate — create a batch for one module. */
studentsRouter.post(
  '/:id/records/generate',
  validate(uuidParamSchema, 'params'),
  validate(generateRecordsSchema),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    const { module, count } = body<{ module: string; count: number }>(req);
    const created = await recordService.generate(id, module, count, getActor(req));
    res.status(201).json({ records: created, count: created.length });
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

/** DELETE /api/v1/students/:id — soft delete. */
studentsRouter.delete(
  '/:id',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    await studentService.remove(id, getActor(req));
    res.json({ success: true });
  }),
);

/** POST /api/v1/students/:id/verify-company */
studentsRouter.post(
  '/:id/verify-company',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ student: await studentService.setVerification(id, true, getActor(req)) });
  }),
);

/** POST /api/v1/students/:id/unverify-company */
studentsRouter.post(
  '/:id/unverify-company',
  validate(uuidParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = routeParams<{ id: string }>(req);
    res.json({ student: await studentService.setVerification(id, false, getActor(req)) });
  }),
);
