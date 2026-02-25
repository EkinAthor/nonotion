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
  DatabaseRow,
  UpdateSchemaInput,
  UpdatePropertiesInput,
  UpdateKanbanCardOrderInput,
  FileUploadResponse,
  ImportResult,
  GoogleLoginInput,
  AuthConfigResponse,
} from '@nonotion/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  if (response.status === 401 && !options?.skipAuth) {
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

  googleLogin: (input: GoogleLoginInput) =>
    request<AuthResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    }),

  getConfig: () =>
    request<AuthConfigResponse>('/auth/config', { skipAuth: true }),
};

// Users API
export const usersApi = {
  getAll: () => request<PublicUser[]>('/users'),

  list: () => request<PublicUser[]>('/users/list'),

  get: (id: string) => request<PublicUser>(`/users/${id}`),

  search: (email: string) =>
    request<PublicUser[]>(`/users/search?email=${encodeURIComponent(email)}`),

  resetPassword: (id: string, input: AdminResetPasswordInput) =>
    request<PublicUser>(`/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateRole: (id: string, role: 'admin' | 'user') =>
    request<PublicUser>(`/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  delete: (id: string) =>
    request<void>(`/users/${id}`, {
      method: 'DELETE',
    }),

  approve: (id: string, approved: boolean) =>
    request<PublicUser>(`/users/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ approved }),
    }),

  updateOwner: (id: string, isOwner: boolean) =>
    request<PublicUser>(`/users/${id}/owner`, {
      method: 'PATCH',
      body: JSON.stringify({ isOwner }),
    }),
};

// Shares API
export interface ShareWithUser extends PagePermission {
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

// Database API
export interface GetRowsOptions {
  sort?: string;
  filter?: string;
  limit?: number;
  offset?: number;
}

export interface GetRowsResult {
  rows: DatabaseRow[];
  total: number;
}

export const databaseApi = {
  getRows: (databaseId: string, options: GetRowsOptions = {}) => {
    const params = new URLSearchParams();
    if (options.sort) params.set('sort', options.sort);
    if (options.filter) params.set('filter', options.filter);
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));

    const query = params.toString();
    const url = `/databases/${databaseId}/rows${query ? `?${query}` : ''}`;
    return request<GetRowsResult>(url);
  },

  updateSchema: (databaseId: string, input: UpdateSchemaInput) =>
    request<Page>(`/pages/${databaseId}/schema`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  updateProperties: (pageId: string, input: UpdatePropertiesInput) =>
    request<Page>(`/pages/${pageId}/properties`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  updateKanbanCardOrder: (databaseId: string, input: UpdateKanbanCardOrderInput) =>
    request<Page>(`/databases/${databaseId}/kanban-order`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
};

// Files API
export const filesApi = {
  upload: async (file: File): Promise<FileUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/files`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json() as ApiError;
      throw new Error(error.error?.message || 'Upload failed');
    }

    const result = await response.json() as ApiResponse<FileUploadResponse>;
    return result.data;
  },

  getImageBlobUrl: async (fileUrl: string): Promise<string> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${fileUrl.replace('/api', '')}`, {
      headers,
    });

    if (!response.ok) {
      throw new Error('Failed to load image');
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};

// Search API
export interface SearchResult {
  type: 'page' | 'block' | 'property';
  pageId: string;
  pageTitle: string;
  pageIcon: string | null;
  pageType: string;
  matchText: string;
  blockId?: string;
  isStarred: boolean;
}

export const searchApi = {
  search: (query: string) =>
    request<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
};

// Import API
export const importApi = {
  importZip: async (file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/import`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json() as ApiError;
      throw new Error(error.error?.message || 'Import failed');
    }

    const result = await response.json() as ApiResponse<ImportResult>;
    return result.data;
  },
};
