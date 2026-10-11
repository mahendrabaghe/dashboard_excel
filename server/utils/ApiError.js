export class ApiError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found.') {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message) {
    return new ApiError(409, message, 'CONFLICT');
  }

  static payloadTooLarge(message) {
    return new ApiError(413, message, 'PAYLOAD_TOO_LARGE');
  }

  static unprocessable(message, details) {
    return new ApiError(422, message, 'UNPROCESSABLE', details);
  }
}
