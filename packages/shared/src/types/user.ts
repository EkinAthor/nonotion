export type UserRole = 'admin' | 'user';

export interface User {
  id: string; // "usr_xxxxx"
  email: string;
  name: string;
  passwordHash: string; // bcrypt hash (never expose to client)
  avatarUrl: string | null;
  googleId: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  approved: boolean; // Whether admin has approved user access
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// Safe user type without sensitive fields (for client)
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  googleId: string | null;
  role: UserRole;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  avatarUrl?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AdminResetPasswordInput {
  newPassword: string;
  mustChangePassword?: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  token: string;
  mustChangePassword: boolean;
}

export interface UpdateUserRoleInput {
  role: UserRole;
}

export interface GoogleLoginInput {
  credential: string;
}

export type AuthMode = 'db' | 'google';

export interface AuthConfigResponse {
  enabledModes: AuthMode[];
  googleClientId: string | null;
}
