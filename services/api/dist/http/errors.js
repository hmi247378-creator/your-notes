export class ApiError extends Error {
    code;
    statusCode;
    details;
    constructor(code, statusCode, message, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}
export function badRequest(message, details) {
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
export function conflict(message, details) {
    return new ApiError('CONFLICT', 409, message, details);
}
