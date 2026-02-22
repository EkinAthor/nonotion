import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { User, PublicUser, RegisterInput, LoginInput, ChangePasswordInput, AuthMode } from '@nonotion/shared';
import { generateUserId, now } from '@nonotion/shared';
import { getUserStorage } from '../storage/storage-factory.js';

const SALT_ROUNDS = 10;

// Lazy-initialized Google OAuth client
let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!googleClient) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

export function getEnabledAuthModes(): AuthMode[] {
  const raw = process.env.AUTH_MODES || 'db';
  return raw.split(',').map(s => s.trim()).filter((s): s is AuthMode => s === 'db' || s === 'google');
}

export function isAuthModeEnabled(mode: AuthMode): boolean {
  return getEnabledAuthModes().includes(mode);
}

function hasPassword(user: User): boolean {
  return user.passwordHash !== '';
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    googleId: user.googleId,
    role: user.role,
    approved: user.approved,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function register(input: RegisterInput): Promise<User> {
  if (!isAuthModeEnabled('db')) {
    throw new Error('Email/password registration is not enabled');
  }

  // Check if user already exists
  const existingUser = await getUserStorage().getUserByEmail(input.email);
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Check if this should be an admin
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const userCount = await getUserStorage().countUsers();
  const isAdmin = input.email.toLowerCase() === adminEmail || userCount === 0;

  // Determine if user should be auto-approved
  // Admins are always approved, regular users require approval by default
  // Set REQUIRE_USER_APPROVAL=false to auto-approve new users
  const autoApprove = process.env.REQUIRE_USER_APPROVAL === 'false';
  const approved = isAdmin || autoApprove;

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const timestamp = now();
  const user: User = {
    id: generateUserId(),
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash,
    avatarUrl: null,
    googleId: null,
    role: isAdmin ? 'admin' : 'user',
    mustChangePassword: false,
    approved,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return getUserStorage().createUser(user);
}

export async function login(input: LoginInput): Promise<User> {
  if (!isAuthModeEnabled('db')) {
    throw new Error('Email/password login is not enabled');
  }

  const user = await getUserStorage().getUserByEmail(input.email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!hasPassword(user)) {
    throw new Error('This account uses Google login. Please sign in with Google.');
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  return user;
}

export async function googleLogin(credential: string): Promise<User> {
  if (!isAuthModeEnabled('google')) {
    throw new Error('Google login is not enabled');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('Google login is not configured');
  }

  // Verify the ID token
  const ticket = await getGoogleClient().verifyIdToken({
    idToken: credential,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid Google credential');
  }

  const { sub: googleId, email, name, picture } = payload;
  if (!email) {
    throw new Error('Google account has no email address');
  }

  // 1. Look up by googleId — returning user
  const existingByGoogle = await getUserStorage().getUserByGoogleId(googleId);
  if (existingByGoogle) {
    return existingByGoogle;
  }

  // 2. Look up by email — auto-link
  const existingByEmail = await getUserStorage().getUserByEmail(email);
  if (existingByEmail) {
    const timestamp = now();
    const updates: Partial<User> = {
      googleId,
      updatedAt: timestamp,
    };
    // Optionally update avatar if user doesn't have one
    if (!existingByEmail.avatarUrl && picture) {
      updates.avatarUrl = picture;
    }
    const updated = await getUserStorage().updateUser(existingByEmail.id, updates);
    return updated ?? existingByEmail;
  }

  // 3. Create new user
  const userCount = await getUserStorage().countUsers();
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const isAdmin = email.toLowerCase() === adminEmail || userCount === 0;
  const autoApprove = process.env.REQUIRE_USER_APPROVAL === 'false';
  const approved = isAdmin || autoApprove;

  const timestamp = now();
  const user: User = {
    id: generateUserId(),
    email: email.toLowerCase(),
    name: name || email.split('@')[0],
    passwordHash: '', // Google-only user, no password
    avatarUrl: picture || null,
    googleId,
    role: isAdmin ? 'admin' : 'user',
    mustChangePassword: false,
    approved,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return getUserStorage().createUser(user);
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput
): Promise<User> {
  const user = await getUserStorage().getUser(userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (!hasPassword(user)) {
    throw new Error('This account uses Google login and has no password to change. An admin can set a password for you.');
  }

  const isValidPassword = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Current password is incorrect');
  }

  const newPasswordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  const timestamp = now();

  const updated = await getUserStorage().updateUser(userId, {
    passwordHash: newPasswordHash,
    mustChangePassword: false,
    updatedAt: timestamp,
  });

  if (!updated) {
    throw new Error('Failed to update password');
  }

  return updated;
}

export async function adminResetPassword(
  userId: string,
  newPassword: string,
  mustChangePassword: boolean = true
): Promise<User> {
  const user = await getUserStorage().getUser(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const timestamp = now();

  const updated = await getUserStorage().updateUser(userId, {
    passwordHash: newPasswordHash,
    mustChangePassword,
    updatedAt: timestamp,
  });

  if (!updated) {
    throw new Error('Failed to reset password');
  }

  return updated;
}

export async function getCurrentUser(userId: string): Promise<User | null> {
  return getUserStorage().getUser(userId);
}

export async function ensureAdminPasswordReset(): Promise<void> {
  const newPassword = process.env.RESET_ADMIN_PASSWORD;
  if (!newPassword) return;

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  let userToReset: User | undefined | null = null;

  if (adminEmail) {
    userToReset = await getUserStorage().getUserByEmail(adminEmail);
  }

  if (!userToReset) {
    // Fallback: find any admin
    const allUsers = await getUserStorage().getAllUsers();
    userToReset = allUsers.find(u => u.role === 'admin');
  }

  if (userToReset) {
    console.log(`[Auth] Resetting password for admin user: ${userToReset.email}`);
    // We set mustChangePassword to false because the admin explicitly set this password via env var
    await adminResetPassword(userToReset.id, newPassword, false);
    console.log(`[Auth] Password reset successful. Please remove RESET_ADMIN_PASSWORD environment variable to prevent overwriting on next restart.`);
  } else {
    console.warn(`[Auth] RESET_ADMIN_PASSWORD is set, but no admin user found to reset.`);
  }
}
