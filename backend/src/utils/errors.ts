/** Machine-readable error codes returned to the client. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CSRF_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  /** Detail intended for the server log only; never sent to the client. */
  readonly logDetail?: string;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options: { fields?: Record<string, string>; logDetail?: string } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = options.fields;
    this.logDetail = options.logDetail;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, 'VALIDATION_ERROR', message, { fields });

export const unauthenticated = (
  message = 'Your session is no longer valid. Please sign in again.',
  code: ErrorCode = 'UNAUTHENTICATED',
) => new AppError(401, code, message);

export const sessionExpired = () =>
  new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'The requested resource was not found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError(409, 'CONFLICT', message, { fields });
