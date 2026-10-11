import 'dotenv/config';

/**
 * Centralised, validated environment configuration.
 * Secrets are only read here and never forwarded to the client.
 */
const isProd = process.env.NODE_ENV === 'production';

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5000,
  MONGODB_URI: required('MONGODB_URI', isProd ? undefined : 'mongodb://127.0.0.1:27017/datapulse'),
  JWT_SECRET: required('JWT_SECRET', isProd ? undefined : 'dev-only-secret-change-me'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  // Comma-separated list of allowed frontend origins, e.g. https://datapulse-web.onrender.com
  CLIENT_ORIGINS: (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Optional external AI provider (called only from the backend)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  isProd,
};

if (isProd && env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}
