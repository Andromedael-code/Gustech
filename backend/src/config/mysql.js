import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool;

function formatSqlError(error, context = {}) {
  const wrapped = new Error(error.message || 'Erro de banco de dados.');
  wrapped.name = 'DatabaseError';
  wrapped.code = error.code;
  wrapped.errno = error.errno;
  wrapped.sqlState = error.sqlState;
  wrapped.sqlMessage = error.sqlMessage;
  wrapped.context = context;
  wrapped.cause = error;
  return wrapped;
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...env.mysql, multipleStatements: true });
  }
  return pool;
}

export async function query(sql, params, context = {}) {
  try {
    const [rows] = await getPool().execute(sql, params);
    return rows;
  } catch (error) {
    throw formatSqlError(error, { ...context, sql, params });
  }
}

export async function withTransaction(callback) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    if (error?.statusCode) throw error;
    throw formatSqlError(error, { operation: 'transaction' });
  } finally {
    connection.release();
  }
}

export async function ensureSchema() {
  const schemaPath = new URL('../db/schema.sql', import.meta.url);
  const rawSchema = await fs.readFile(schemaPath, 'utf8');
  const schema = rawSchema
    .replace(/CREATE DATABASE IF NOT EXISTS\s+gustech/gi, `CREATE DATABASE IF NOT EXISTS \`${env.mysql.database}\``)
    .replace(/USE\s+gustech\s*;/gi, `USE \`${env.mysql.database}\`;
`);

  const adminConnection = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    multipleStatements: true
  });

  try {
    await adminConnection.query(schema);
  } catch (error) {
    throw formatSqlError(error, { operation: 'ensureSchema', schemaPath: schemaPath.pathname });
  } finally {
    await adminConnection.end();
  }
}
