export type Role = 'ADMIN' | 'USER';

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A user as shown in User Management: the profile plus the live operational
 * facts an administrator needs at a glance.
 */
export interface UserListItem extends UserRecord {
  /** Sessions that are neither revoked nor expired right now. */
  activeSessions: number;
}

/** The statement format a record was generated for. */
export type RecordBank = 'SBI' | 'IDBI';

/** A student's records come in the bank formats plus emails. */
export type StudentRecordBank = RecordBank | 'EMAIL';

/** A generated statement listed on a student's page. */
export interface StudentRecordSummary {
  id: string;
  studentId: string;
  bank: StudentRecordBank;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** File name of the statement page the record was generated from. */
  attachmentName: string | null;
  /** Set on the one record per student and bank that has been finalized. */
  finalizedAt: string | null;
  finalizedBy: string | null;
  finalizedByName: string | null;
  /** Set when an admin released the un-watermarked statement to the owner. */
  downloadReleasedAt: string | null;
  downloadReleasedBy: string | null;
  /** Set when an admin marked the finalized record done and it was mailed. */
  doneAt: string | null;
  /** The email form's input, listed with EMAIL records only. */
  emailInput: unknown;
}

/** The same record with the three payloads the module produced. */
export interface StudentRecordEntry extends StudentRecordSummary {
  /** What the Generate-record form collected. */
  input: unknown;
  /** Account block and salary periods read off the uploaded statement. */
  extract: unknown;
  /** accountInfo, salaryTrans and transactions as generated. */
  statement: unknown;
}

/** Where a standalone SBI report's payload came from. */
export type SbiReportSource = 'extract' | 'transactions';

/** A report as listed on the SBI screen. */
export interface SbiReportSummary {
  id: string;
  bank: RecordBank;
  source: SbiReportSource;
  customerName: string | null;
  accountNumber: string | null;
  transactionCount: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

/** The same report with the pasted payload and what was built from it. */
export interface SbiReportEntry extends SbiReportSummary {
  input: unknown;
  statement: unknown;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StudentRecord {
  id: string;
  /** Five-digit public id, assigned by the database. */
  studentCode: string;
  name: string;
  mobileNumber: string;
  offerCompany: string | null;
  referredBy: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the student was archived; archived students are hidden from users. */
  archivedAt: string | null;
  /** Set when an admin marked the student done and the backup mail went out. */
  doneAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RequestActor {
  user: UserRecord;
  session: SessionRecord;
  ipAddress: string | null;
  userAgent: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      actor?: RequestActor;
    }
  }
}
