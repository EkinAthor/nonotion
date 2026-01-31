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
} from '@nonotion/shared';

const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  //handling situatation when body does not exist (so we don't send content type header)
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

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

// Pages API
export const pagesApi = {
  getAll: () => request<Page[]>('/pages'),

  get: (id: string) => request<Page>(`/pages/${id}`),

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
