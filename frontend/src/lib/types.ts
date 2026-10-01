export type Role = 'ADMIN' | 'USER';

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A user as listed in User Management, with live operational facts. */
export interface UserListItem extends User {
  /** Sessions that are neither revoked nor expired right now. */
  activeSessions: number;
}

export interface Student {
  id: string;
  /** Five-digit public id. */
  studentCode: string;
  name: string;
  mobileNumber: string;
  offerCompany: string | null;
  referredBy: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the student was archived; users never see archived students. */
  archivedAt: string | null;
}

/** One row of a transaction table, exactly as the SBI module emits it. */
export interface SbiTransaction {
  Date: string;
  Narration: string;
  Ref: string;
  Debit: string;
  Credit: string;
  Balance: string;
  isSalary?: boolean;
}

export interface SbiStatement {
  accountInfo: Record<string, string>;
  salaryTrans: string[];
  transactions: SbiTransaction[];
  invalidDates: unknown[];
}

/** One row of an IDBI-format statement, as that module emits it. */
export interface IdbiTransaction {
  /** `dd/mm/yyyy hh:mm:ss` */
  date: string;
  details: string;
  type: 'Cr' | 'Dr';
  amount: string;
  balance: string;
  isSalary?: boolean;
}

export interface IdbiStatement {
  accountInfo: Record<string, string>;
  salaryTrans: string[];
  transactions: IdbiTransaction[];
  invalidDates: unknown[];
}

/** The statement format a record was generated for. */
export type RecordBank = 'SBI' | 'IDBI';

/** A student's records come in the bank formats plus emails. */
export type StudentRecordBank = RecordBank | 'EMAIL';

/** One email of an email record, as the form saves it. */
export interface EmailInput {
  subject: string;
  date: string;
  hour: number;
  minute: number;
  meridiem: 'AM' | 'PM';
  /** 'all' adds the sender fields below to the output. */
  mode?: 'date' | 'all';
  senderName?: string;
  senderEmail?: string;
  mailedBy?: string;
  signedBy?: string;
  logo?: string;
  fileId?: string | null;
  attachmentName?: string | null;
  replacements: { find: string; replace: string }[];
}

/** A generated statement as listed on a student's page. */
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
  /** Set on the one record per student that has been finalized. */
  finalizedAt: string | null;
  finalizedBy: string | null;
  finalizedByName: string | null;
  /** Set when an admin released the clean statement to the student's owner. */
  downloadReleasedAt: string | null;
  downloadReleasedBy: string | null;
  /** The email form's input, on EMAIL records only. */
  emailInput: { emails: EmailInput[] } | null;
}

/** What the server resolved about a machine when the session was created. */
export interface SessionClientInfo {
  ipAddress?: string | null;
  hostname?: string | null;
  provider?: string | null;
  macAddress?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
  device?: string | null;
}

/** One live session of a user, as User Management lists it. */
export interface ActiveSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  clientInfo: SessionClientInfo | null;
}

/** The same record with the three payloads that produced it. */
export interface StudentRecordEntry extends StudentRecordSummary {
  input: Record<string, unknown>;
  extract: Record<string, unknown>;
  statement: SbiStatement | IdbiStatement;
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
  statement: SbiStatement | IdbiStatement;
}

export interface SessionInfo {
  expiresAt: string;
  lifetimeMs: number;
}

export interface SessionResponse {
  authenticated: boolean;
  user: User;
  session: SessionInfo;
  csrfToken: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
}

export interface StudentStats {
  /** Students still in play; archived ones are counted separately. */
  total: number;
  archived: number;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Response of GET /users/:id/audit. */
export interface UserAuditPage extends Paginated<AuditEntry> {
  user: User;
}

export interface AdminStats {
  users: UserStats;
  students: StudentStats;
  recentActivity: AuditEntry[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
}

export interface StudentStats {
  /** Students still in play; archived ones are counted separately. */
  total: number;
  archived: number;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/** Response of GET /users/:id/audit. */
export interface UserAuditPage extends Paginated<AuditEntry> {
  user: User;
}

export interface AdminStats {
  users: UserStats;
  students: StudentStats;
  recentActivity: AuditEntry[];
}
