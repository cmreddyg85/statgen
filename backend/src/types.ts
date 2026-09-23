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

/** A generated statement listed on a student's page. */
export interface StudentRecordSummary {
  id: string;
  studentId: string;
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

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StudentRecord {
  id: string;
  name: string;
  mobileNumber: string;
  offerCompany: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when the student was archived; archived students are hidden from users. */
  archivedAt: string | null;
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
