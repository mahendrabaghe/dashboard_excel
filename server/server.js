import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { connectDB, dbState } from './config/db.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // Render sits behind a proxy

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, cb) {
      // Allow server-to-server / curl (no Origin header) and explicitly listed frontends
      if (!origin || env.CLIENT_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);

app.use(compression());
app.use(hpp());
// Global per-IP limit; stricter limits are applied per route (auth, uploads, AI)
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 2000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Liveness/readiness for Render health checks (outside /api for simplicity)
app.get('/healthz', (_req, res) => {
  const dbOk = dbState() === 1;
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'connected' : 'disconnected' });
});

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await connectDB();
  } catch (err) {
    logger.error('failed to connect to MongoDB', { message: err.message });
    process.exit(1);
  }
  const server = app.listen(env.PORT, () => {
    logger.info('server listening', { port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = (signal) => {
    logger.info('shutting down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
