import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns a request id used in logs and in every error response, so a user
 * can quote it to support and the exact request can be found.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : `req_${randomUUID()}`;
  res.setHeader('x-request-id', req.id);
  next();
}

export function clientIp(req: Request): string | null {
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  if (!ip) return null;
  // Normalize IPv4-mapped IPv6 addresses so they fit the inet column cleanly.
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function clientUserAgent(req: Request): string | null {
  return req.header('user-agent')?.slice(0, 400) ?? null;
}
