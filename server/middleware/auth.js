import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'datapulse',
    audience: 'datapulse-web',
  });
}

/** Requires a valid Bearer JWT and attaches req.user (fresh from the DB). */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        issuer: 'datapulse',
        audience: 'datapulse-web',
      });
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }

    const user = await User.findById(payload.sub).select('+passwordHash');
    if (!user) throw ApiError.unauthorized();
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
