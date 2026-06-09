import { AppError } from '../utils/http.js';
import { logger } from '../config/logger.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

function logUnexpectedError(error) {
  if (error?.name === 'DatabaseError' || error?.code || error?.sqlMessage) {
    logger.error({
      err: error,
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      context: error.context
    }, 'Erro de banco de dados');
    return;
  }

  logger.error({ err: error }, 'Erro inesperado no servidor');
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details });
  }

  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: error.message || 'Requisicao invalida.' });
  }

  logUnexpectedError(error);
  return res.status(500).json({
    error: 'Falha interna ao processar a requisição.',
    code: error?.code || 'INTERNAL_SERVER_ERROR'
  });
}
