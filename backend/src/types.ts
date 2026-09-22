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
  companyVerified: boolean;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A record generated for a student against one business module. */
export interface StudentModuleRecord {
  id: string;
  studentId: string;
  module: string;
  reference: string;
  status: string;
  payload: Record<string, unknown>;
  generatedBy: string;
  generatedByName: string | null;
  createdAt: string;
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
