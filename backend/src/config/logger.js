import { env } from './env.js';

async function loadOptionalPackage(name) {
  try {
    return (await import(name)).default;
  } catch {
    return null;
  }
}

function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: env.nodeEnv === 'production' ? undefined : error.stack,
    code: error.code
  };
}

function createFallbackLogger() {
  const write = (level, payload, message) => {
    const record = {
      level,
      time: new Date().toISOString(),
      msg: message || (typeof payload === 'string' ? payload : undefined),
      ...(payload && typeof payload === 'object' ? payload : {})
    };
    if (record.err) record.err = serializeError(record.err);
    const line = JSON.stringify(record);
    if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };

  return {
    debug: (payload, message) => write('debug', payload, message),
    info: (payload, message) => write('info', payload, message),
    warn: (payload, message) => write('warn', payload, message),
    error: (payload, message) => write('error', payload, message)
  };
}

const pino = await loadOptionalPackage('pino');
const pinoHttp = await loadOptionalPackage('pino-http');
const pinoPretty = await loadOptionalPackage('pino-pretty');

export const logger = pino
  ? pino({
      level: env.nodeEnv === 'production' ? 'info' : 'debug',
      transport: env.nodeEnv !== 'production' && pinoPretty
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' }
          }
        : undefined
    })
  : createFallbackLogger();

export const httpLogger = pinoHttp
  ? pinoHttp({
      logger,
      customLogLevel(_req, res, error) {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      }
    })
  : (req, res, next) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        logger[level]({
          req: { method: req.method, url: req.originalUrl || req.url, ip: req.ip },
          res: { statusCode: res.statusCode },
          responseTime: Date.now() - startedAt
        }, 'request completed');
      });
      next();
    };
