import bcrypt from 'bcryptjs';
import type { User, PublicUser, RegisterInput, LoginInput, ChangePasswordInput } from '@nonotion/shared';
import { generateUserId, now } from '@nonotion/shared';
import { getUserStorage } from '../storage/storage-factory.js';

const SALT_ROUNDS = 10;

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    approved: user.approved,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function register(input: RegisterInput): Promise<User> {
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
    role: isAdmin ? 'admin' : 'user',
    mustChangePassword: false,
    approved,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return getUserStorage().createUser(user);
}

export async function login(input: LoginInput): Promise<User> {
  const user = await getUserStorage().getUserByEmail(input.email);
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new Error('Invalid email or password');
  }

  return user;
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput
): Promise<User> {
  const user = await getUserStorage().getUser(userId);
  if (!user) {
    throw new Error('User not found');
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
