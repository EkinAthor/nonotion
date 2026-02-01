import type {
  Page,
  Block,
  CreatePageInput,
  UpdatePageInput,
  CreateBlockInput,
  UpdateBlockInput,
  ReorderBlocksInput,
  ApiResponse,
  ApiError,
  AuthResponse,
  LoginInput,
  RegisterInput,
  ChangePasswordInput,
  PublicUser,
  PagePermission,
  SharePageInput,
  UpdateShareInput,
  AdminResetPasswordInput,
} from '@nonotion/shared';

const API_BASE = '/api';

// Get token from localStorage (zustand persist)
function getToken(): string | null {
  try {
    const stored = localStorage.getItem('nonotion-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.state?.token ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

async function request<T>(
  endpoint: string,
  options?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const headers = new Headers(options?.headers);

  // Add auth header if we have a token and not explicitly skipping
  if (!options?.skipAuth) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 - clear auth and redirect to login
  if (response.status === 401) {
    localStorage.removeItem('nonotion-auth');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json() as ApiError;
    throw new Error(error.error?.message || 'Request failed');
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const result = await response.json() as ApiResponse<T>;
  return result.data;
}

// Auth API
export const authApi = {
  login: (input: LoginInput) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  register: (input: RegisterInput) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  me: () => request<PublicUser & { mustChangePassword: boolean }>('/auth/me'),

  changePassword: (input: ChangePasswordInput) =>
    request<PublicUser>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// Users API
export const usersApi = {
  getAll: () => request<PublicUser[]>('/users'),

  get: (id: string) => request<PublicUser>(`/users/${id}`),

  search: (email: string) =>
    request<PublicUser[]>(`/users/search?email=${encodeURIComponent(email)}`),

  resetPassword: (id: string, input: AdminResetPasswordInput) =>
    request<PublicUser>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

// Shares API
interface ShareWithUser extends PagePermission {
  user: PublicUser | null;
}

export const sharesApi = {
  getByPage: (pageId: string) =>
    request<ShareWithUser[]>(`/pages/${pageId}/shares`),

  create: (pageId: string, input: SharePageInput) =>
    request<ShareWithUser>(`/pages/${pageId}/shares`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (pageId: string, userId: string, input: UpdateShareInput) =>
    request<ShareWithUser>(`/pages/${pageId}/shares/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (pageId: string, userId: string) =>
    request<void>(`/pages/${pageId}/shares/${userId}`, {
      method: 'DELETE',
    }),
};

// Pages API
export const pagesApi = {
  getAll: () => request<Page[]>('/pages'),

  get: (id: string) => request<Page>(`/pages/${id}`),

  getPermission: (id: string) =>
    request<{ level: 'owner' | 'full_access' | 'editor' | 'viewer' }>(`/pages/${id}/permission`),

  create: (input: CreatePageInput) =>
    request<Page>('/pages', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: UpdatePageInput) =>
    request<Page>(`/pages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<void>(`/pages/${id}`, {
      method: 'DELETE',
    }),
};

// Blocks API
export const blocksApi = {
  getByPage: (pageId: string) =>
    request<Block[]>(`/pages/${pageId}/blocks`),

  create: (pageId: string, input: Omit<CreateBlockInput, 'pageId'>) =>
    request<Block>(`/pages/${pageId}/blocks`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: UpdateBlockInput) =>
    request<Block>(`/blocks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<void>(`/blocks/${id}`, {
      method: 'DELETE',
    }),

  reorder: (pageId: string, input: ReorderBlocksInput) =>
    request<Block[]>(`/pages/${pageId}/blocks/reorder`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};
