export type UserRole = 'admin' | 'user';

// Purpose of an in-flight email verification code
export type TwoFactorCodePurpose = 'login' | 'enable';

export interface User {
  id: string; // "usr_xxxxx"
  email: string;
  name: string;
  passwordHash: string; // bcrypt hash (never expose to client)
  avatarUrl: string | null;
  googleId: string | null;
  role: UserRole;
  isOwner: boolean;
  mustChangePassword: boolean;
  approved: boolean; // Whether admin has approved user access
  twoFactorEnabled: boolean; // Email 2FA enabled for this account
  // Ephemeral email-2FA challenge state (never expose to client)
  twoFactorCodeHash: string | null; // bcrypt hash of the pending 6-digit code
  twoFactorCodeExpiresAt: string | null; // ISO 8601 expiry of the pending code
  twoFactorCodeAttempts: number; // failed verification attempts for the pending code
  twoFactorCodePurpose: TwoFactorCodePurpose | null; // what the pending code is for
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
  isOwner: boolean;
  approved: boolean;
  twoFactorEnabled: boolean;
  hasPassword: boolean; // derived: true when the account has a password (not Google-only)
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

// Returned by login when the account has email 2FA enabled — the caller must
// exchange the pendingToken + emailed code at the verify-2fa endpoint.
export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  pendingToken: string;
}

// login() may resolve to either a full auth response or a 2FA challenge
export type LoginResponse = AuthResponse | TwoFactorChallengeResponse;

export interface VerifyTwoFactorInput {
  pendingToken: string;
  code: string;
}

export interface ConfirmTwoFactorInput {
  code: string;
}

export interface DisableTwoFactorInput {
  password: string;
}

export interface AdminSetTwoFactorInput {
  enabled: boolean;
}

export interface UpdateUserRoleInput {
  role: UserRole;
}

export interface UpdateOwnerInput {
  isOwner: boolean;
}

export interface GoogleLoginInput {
  credential: string;
}

export type AuthMode = 'db' | 'google';

export interface AuthConfigResponse {
  enabledModes: AuthMode[];
  googleClientId: string | null;
}
