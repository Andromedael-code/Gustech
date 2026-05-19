import { AppError } from '../utils/http.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

function logUnexpectedError(error) {
  if (error?.name === 'DatabaseError' || error?.code || error?.sqlMessage) {
    console.error('[mysql]', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      context: error.context
    });
    return;
  }

  console.error('[server]', error);
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details });
  }

  logUnexpectedError(error);
  return res.status(500).json({
    error: 'Falha interna ao processar a requisição.',
    code: error?.code || 'INTERNAL_SERVER_ERROR'
  });
}
