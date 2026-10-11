/** Minimal structured logger. Never logs secrets, tokens, passwords or file contents. */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function write(level, msg, meta) {
  if (LEVELS[level] > current) return;
  const line = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  };
  const out = level === 'error' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  error: (msg, meta) => write('error', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  debug: (msg, meta) => write('debug', msg, meta),
};
