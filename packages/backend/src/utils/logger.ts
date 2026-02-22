type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, msg: string, extra?: any): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  if (extra !== undefined) {
    const detail = extra instanceof Error ? extra.stack || extra.message : JSON.stringify(extra);
    return `${base} — ${detail}`;
  }
  return base;
}

export const log = {
  debug(msg: string, extra?: any) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', msg, extra));
  },
  info(msg: string, extra?: any) {
    if (shouldLog('info')) console.log(formatMessage('info', msg, extra));
  },
  warn(msg: string, extra?: any) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', msg, extra));
  },
  error(msg: string, extra?: any) {
    if (shouldLog('error')) console.error(formatMessage('error', msg, extra));
  },
};
