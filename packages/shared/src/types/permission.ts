export type PermissionLevel = 'owner' | 'full_access' | 'editor' | 'viewer';

export interface PagePermission {
  pageId: string; // "pg_xxxxx"
  userId: string; // "usr_xxxxx"
  level: PermissionLevel;
  grantedBy: string; // "usr_xxxxx" - who granted this permission
  grantedAt: string; // ISO 8601
}

export interface SharePageInput {
  userId: string;
  level: PermissionLevel;
}

export interface UpdateShareInput {
  level: PermissionLevel;
}

export interface PageWithPermission {
  pageId: string;
  level: PermissionLevel;
}
