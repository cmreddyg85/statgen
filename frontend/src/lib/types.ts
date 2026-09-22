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
  total: number;
  verified: number;
  unverified: number;
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

/** An option in the Generate screen's module dropdown. */
export interface ModuleOption {
  key: string;
  label: string;
  description: string;
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
