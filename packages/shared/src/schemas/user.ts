import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'user']);

export const userSchema = z.object({
  id: z.string().startsWith('usr_'),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  passwordHash: z.string(),
  avatarUrl: z.string().url().nullable(),
  role: userRoleSchema,
  mustChangePassword: z.boolean(),
  approved: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const publicUserSchema = z.object({
  id: z.string().startsWith('usr_'),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().nullable(),
  role: userRoleSchema,
  approved: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const registerInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const adminResetPasswordInputSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  mustChangePassword: z.boolean().optional().default(true),
});

export const updateUserInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type UserSchema = z.infer<typeof userSchema>;
export type PublicUserSchema = z.infer<typeof publicUserSchema>;
export type RegisterInputSchema = z.infer<typeof registerInputSchema>;
export type LoginInputSchema = z.infer<typeof loginInputSchema>;
export type ChangePasswordInputSchema = z.infer<typeof changePasswordInputSchema>;
export type AdminResetPasswordInputSchema = z.infer<typeof adminResetPasswordInputSchema>;
export type UpdateUserInputSchema = z.infer<typeof updateUserInputSchema>;

export const updateUserRoleInputSchema = z.object({
  role: userRoleSchema,
});

export type UpdateUserRoleInputSchema = z.infer<typeof updateUserRoleInputSchema>;

export const approveUserInputSchema = z.object({
  approved: z.boolean(),
});

export type ApproveUserInputSchema = z.infer<typeof approveUserInputSchema>;
