import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';

export interface MailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

/** Sends through Gmail SMTP; throws a 400 when Gmail is not configured. */
export async function sendMail(subject: string, text: string, attachments: MailAttachment[]) {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw badRequest('Gmail is not configured (GMAIL_USER / GMAIL_APP_PASSWORD).');
  }
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });
  await transport.sendMail({
    from: env.GMAIL_USER,
    to: env.MAIL_TO || env.GMAIL_USER,
    subject,
    text,
    // message/rfc822 (.eml) would be shown as a forwarded mail; octet-stream keeps it a file.
    attachments: attachments.map((a) => ({
      ...a,
      contentType: a.contentType ?? (/\.eml$/i.test(a.filename) ? 'application/octet-stream' : undefined),
      contentDisposition: 'attachment' as const,
    })),
  });
}
