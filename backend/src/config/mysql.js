import fs from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { env } from './env.js';

let pool;

const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_verified_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (email),
  UNIQUE (username),
  UNIQUE (cpf)
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  zip TEXT NOT NULL,
  complement TEXT DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON user_addresses(user_id, is_default);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_by TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (uid)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL,
  payment_details_json TEXT NOT NULL,
  total_amount REAL NOT NULL,
  customer_username TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_cpf TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  invoice_number TEXT NULL,
  invoice_status TEXT NULL,
  invoice_issued_at TEXT NULL,
  shipping_label_code TEXT NULL,
  shipping_carrier TEXT NULL,
  shipping_generated_at TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  zip TEXT NOT NULL,
  complement TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_addresses_order ON order_addresses(order_id);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id TEXT NULL,
  name TEXT NOT NULL,
  image_url TEXT NULL,
  unit_price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  changed_by TEXT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline(order_id, created_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  category TEXT NOT NULL,
  categories_json TEXT NULL,
  brand TEXT NULL,
  badge TEXT NULL,
  image_url TEXT NULL,
  gallery_json TEXT NULL,
  highlights_json TEXT NULL,
  specs_json TEXT NULL,
  variants_json TEXT NULL,
  price REAL NOT NULL DEFAULT 0,
  old_price REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  condition_label TEXT NULL,
  sales INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, is_active);
CREATE INDEX IF NOT EXISTS idx_products_relevance ON products(relevance_score DESC, sales DESC);
CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating DESC, reviews_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_search ON products(name, brand, category); -- fix: CODE-3

CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating REAL NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON product_reviews(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NULL,
  name TEXT NOT NULL,
  image_url TEXT NULL,
  price REAL NOT NULL DEFAULT 0,
  old_price REAL NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cart_product ON cart_items(product_id);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_created ON wishlist_items(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS storefront_settings (
  settings_key TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

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

export function isSqlite() {
  return env.dbClient === 'sqlite';
}

function normalizeSqliteSql(sql) {
  return String(sql || '')
    .replace(/UTC_TIMESTAMP\(\)/gi, 'CURRENT_TIMESTAMP');
}

class SqliteConnection {
  constructor(db) {
    this.db = db;
    this.dialect = 'sqlite';
  }

  async execute(sql, params = []) {
    const normalizedSql = normalizeSqliteSql(sql);
    const trimmed = normalizedSql.trim();
    const statement = this.db.prepare(normalizedSql);
    const values = Array.isArray(params) ? params : [];
    const returnsRows = /^(SELECT|WITH|PRAGMA)\b/i.test(trimmed);

    if (returnsRows) {
      return [statement.all(...values), []];
    }

    const result = statement.run(...values);
    return [{
      insertId: Number(result.lastInsertRowid || 0),
      affectedRows: Number(result.changes || 0)
    }, []];
  }

  async query(sql, params = []) {
    return this.execute(sql, params);
  }

  async beginTransaction() {
    this.db.exec('BEGIN IMMEDIATE');
  }

  async commit() {
    this.db.exec('COMMIT');
  }

  async rollback() {
    this.db.exec('ROLLBACK');
  }

  release() {}
}

class SqlitePool extends SqliteConnection {
  async getConnection() {
    return this;
  }

  async end() {
    this.db.close();
  }
}

function createSqlitePool() {
  const sqlitePath = path.resolve(process.cwd(), env.sqlite.path);
  mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return new SqlitePool(db);
}

export function getPool() {
  if (!pool) {
    pool = isSqlite() ? createSqlitePool() : mysql.createPool(env.mysql);
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
  if (isSqlite()) {
    const sqlitePath = path.resolve(process.cwd(), env.sqlite.path);
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    getPool().db.exec(SQLITE_SCHEMA);
    return;
  }

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
