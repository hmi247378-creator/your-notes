export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  public readonly code: ApiErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(code: ApiErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError('VALIDATION_ERROR', 400, message, details);
}

export function unauthorized(message = 'Unauthorized') {
  return new ApiError('UNAUTHORIZED', 401, message);
}

export function forbidden(message = 'Forbidden') {
  return new ApiError('FORBIDDEN', 403, message);
}

export function notFound(message = 'Not found') {
  return new ApiError('NOT_FOUND', 404, message);
}

export function conflict(message: string, details?: unknown) {
  return new ApiError('CONFLICT', 409, message, details);
}

