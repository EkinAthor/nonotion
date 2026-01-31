export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
  success: false;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
  success: true;
}
