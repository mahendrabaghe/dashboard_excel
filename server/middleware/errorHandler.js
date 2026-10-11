import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } };

  if (err instanceof ApiError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { error: { code: 'BAD_ID', message: 'Invalid identifier supplied.' } };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    body = { error: { code: 'VALIDATION_FAILED', message: 'Some fields are invalid.', details } };
  } else if (err && err.code === 11000) {
    status = 409;
    body = { error: { code: 'DUPLICATE', message: 'A record with this value already exists.' } };
  } else if (err && err.type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } };
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } };
  }

  if (status >= 500) {
    logger.error('request failed', {
      method: req.method,
      path: req.originalUrl,
      message: err?.message,
      stack: env.isProd ? undefined : err?.stack,
    });
  } else {
    logger.warn('request rejected', { method: req.method, path: req.originalUrl, status, code: body.error.code });
  }
  res.status(status).json(body);
}
