import 'dotenv/config';

const splitList = (value, fallback = []) => {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  dbClient: String(process.env.DB_CLIENT || 'sqlite').trim().toLowerCase(),
  corsOrigins: splitList(process.env.CORS_ORIGIN, [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:4182',
    'http://127.0.0.1:4182',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || 'gustech',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    namedPlaceholders: true,
    decimalNumbers: true,
    timezone: 'Z'
  },
  sqlite: {
    path: process.env.SQLITE_PATH || (process.env.VERCEL ? '/tmp/gustech.sqlite' : 'data/gustech.sqlite')
  },
  adminAllowlist: splitList(process.env.ADMIN_ALLOWLIST).map((item) => item.toLowerCase()),
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || 'gustavo-gaymer-loja'
  },
  sms: {
    defaultCountryCode: String(process.env.SMS_DEFAULT_COUNTRY_CODE || '55').replace(/\D/g, '') || '55',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioVerifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
    enabled: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID)
  }
};

export const isProd = env.nodeEnv === 'production';
