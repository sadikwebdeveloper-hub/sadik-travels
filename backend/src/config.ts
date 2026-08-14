import 'dotenv/config';
import path from 'node:path';

const isTrue = (value: string | undefined, fallback = false) => value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const env = (key: string, fallback = '') => process.env[key] ?? fallback;
const normalizeAdminIdentity = (value: string) => { const raw = value.trim(); if (raw.includes('@')) return raw.toLowerCase(); const digits = raw.replace(/[\\s()-]/g, ''); if (digits.startsWith('01') && digits.length === 11) return `+880${digits.slice(1)}`; if (digits.startsWith('8801') && digits.length === 13) return `+${digits}`; return digits; };

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8787')),
  appOrigin: env('APP_ORIGIN', 'http://localhost:8787'),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:8787').split(',').map(value => value.trim()).filter(Boolean),
  trustProxy: isTrue(process.env.TRUST_PROXY),
  dataMode: env('DATA_MODE', 'mongodb') as 'memory' | 'mongodb',
  mongoUri: env('MONGODB_URI', 'mongodb://127.0.0.1:27017/sadik_travels'),
  redisUrl: env('REDIS_URL'),
  jwtSecret: env('JWT_SECRET', 'local-only-change-me-local-only-change-me'),
  jwtIssuer: env('JWT_ISSUER', 'sadik-travels-api'),
  jwtAudience: env('JWT_AUDIENCE', 'sadik-travels-web'),
  accessTokenTtl: env('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenTtl: env('REFRESH_TOKEN_TTL', '30d'),
  cookieDomain: env('COOKIE_DOMAIN') || undefined,
  cookieSecure: isTrue(process.env.COOKIE_SECURE, false),
  adminIdentities: env('ADMIN_IDENTITIES').split(',').map(normalizeAdminIdentity).filter(Boolean),
  bulkSmsApiUrl: env('BULKSMSBD_API_URL', 'https://bulksmsbd.net/api/smsapi'),
  bulkSmsApiKey: env('BULKSMSBD_API_KEY'),
  bulkSmsSenderId: env('BULKSMSBD_SENDER_ID'),
  smtpHost: env('SMTP_HOST'),
  smtpPort: Number(env('SMTP_PORT', '587')),
  smtpUser: env('SMTP_USER'),
  smtpPassword: env('SMTP_PASSWORD'),
  smtpFrom: env('SMTP_FROM'),
  providerMode: env('PROVIDER_MODE', 'live') as 'live',
  providerBaseUrl: env('TRAVEL_PROVIDER_BASE_URL'),
  providerApiKey: env('TRAVEL_PROVIDER_API_KEY'),
  providerTimeoutMs: Number(env('TRAVEL_PROVIDER_TIMEOUT_MS', '12000')),
  paymentMode: env('PAYMENT_MODE', 'live') as 'live',
  paymentBaseUrl: env('PAYMENT_PROVIDER_BASE_URL'),
  paymentApiKey: env('PAYMENT_PROVIDER_API_KEY'),
  paymentWebhookSecret: env('PAYMENT_WEBHOOK_SECRET'),
  devOtpEcho: isTrue(process.env.DEV_OTP_ECHO, false),
  logLevel: env('LOG_LEVEL', 'info'),
  publicDir: path.resolve(process.cwd(), env('PUBLIC_DIR', process.env.NODE_ENV === 'production' ? 'public' : '../'))
};

export function validateConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid TCP port');
  if (!['memory', 'mongodb'].includes(config.dataMode)) throw new Error('DATA_MODE must be memory or mongodb');
  if (config.dataMode === 'mongodb' && !config.mongoUri) throw new Error('MONGODB_URI is required when DATA_MODE=mongodb');
  if (config.isProduction) {
    if (config.jwtSecret.length < 32 || config.jwtSecret.includes('local-only')) throw new Error('JWT_SECRET must be a strong production secret');
    if (config.dataMode !== 'mongodb') throw new Error('Production requires DATA_MODE=mongodb');
    if (config.providerMode !== 'live' || !config.providerBaseUrl || !config.providerApiKey) throw new Error('Production requires a live travel provider adapter and credentials');
    if (config.paymentMode !== 'live' || !config.paymentBaseUrl || !config.paymentApiKey || !config.paymentWebhookSecret) throw new Error('Production requires a live payment provider adapter and webhook secret');
    if (!config.redisUrl) throw new Error('Production requires REDIS_URL for distributed rate limiting');
    if (config.devOtpEcho) throw new Error('DEV_OTP_ECHO must be false in production');
    if (!config.cookieSecure) throw new Error('COOKIE_SECURE must be true in production');
    if (!config.appOrigin.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production');
    if (config.corsOrigins.some(origin => origin === '*')) throw new Error('Wildcard CORS is not allowed in production');
    if (config.corsOrigins.some(origin => !origin.startsWith('https://'))) throw new Error('CORS_ORIGINS must use HTTPS in production');
    if (!config.bulkSmsApiKey || !config.bulkSmsSenderId) throw new Error('Production requires BULKSMSBD_API_KEY and BULKSMSBD_SENDER_ID');
    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword || !config.smtpFrom) throw new Error('Production requires SMTP email delivery settings');
  }
}
