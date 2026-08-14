import 'dotenv/config';
import path from 'node:path';

const isTrue = (value: string | undefined, fallback = false) => value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
const env = (key: string, fallback = '') => process.env[key] ?? fallback;
const normalizeAdminIdentity = (value: string) => { const raw = value.trim(); if (raw.includes('@')) return raw.toLowerCase(); const digits = raw.replace(/[\s()-]/g, ''); if (digits.startsWith('01') && digits.length === 11) return `+880${digits.slice(1)}`; if (digits.startsWith('8801') && digits.length === 13) return `+${digits}`; return digits; };
const normalizeOrigin = (value: string) => { try { return new URL(value.trim()).origin; } catch { return ''; } };
const configuredOrigin = env('APP_ORIGIN') || env('RENDER_EXTERNAL_URL') || (env('RENDER_EXTERNAL_HOSTNAME') ? `https://${env('RENDER_EXTERNAL_HOSTNAME')}` : 'http://localhost:8787');
const appOrigin = normalizeOrigin(configuredOrigin) || 'http://localhost:8787';
const configuredCors = env('CORS_ORIGINS', '').split(',').map(normalizeOrigin).filter(Boolean);

export const config = {
  nodeEnv: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8787')),
  appOrigin,
  corsOrigins: [...new Set([...configuredCors, appOrigin])],
  trustProxy: isTrue(process.env.TRUST_PROXY),
  serveStatic: isTrue(process.env.SERVE_STATIC, true),
  sqlitePath: path.resolve(process.cwd(), env('SQLITE_PATH', './data/sadik.sqlite')),
  jwtSecret: env('JWT_SECRET', 'local-only-change-me-local-only-change-me'),
  jwtIssuer: env('JWT_ISSUER', 'sadik-travels-api'),
  jwtAudience: env('JWT_AUDIENCE', 'sadik-travels-web'),
  accessTokenTtl: env('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenTtl: env('REFRESH_TOKEN_TTL', '30d'),
  cookieDomain: env('COOKIE_DOMAIN') || undefined,
  cookieSecure: isTrue(process.env.COOKIE_SECURE, false),
  cookieSameSite: env('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
  adminIdentities: env('ADMIN_IDENTITIES').split(',').map(normalizeAdminIdentity).filter(Boolean),
  settingsMasterKey: env('SETTINGS_MASTER_KEY', 'local-only-settings-master-key-change-me'),
  smsProvider: env('SMS_PROVIDER', 'custom_gateway') as 'custom_gateway' | 'bulksmsbd',
  // Provider credentials intentionally default to empty. Local OTP can use DEV_OTP_ECHO without sending data anywhere.
  smsGatewayUrl: env('SMS_GATEWAY_URL'),
  smsGatewayUsername: env('SMS_GATEWAY_USERNAME'),
  smsGatewayPassword: env('SMS_GATEWAY_PASSWORD'),
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
  publicDir: path.resolve(process.cwd(), env('PUBLIC_DIR', '.'))
};

export function validateConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be a valid TCP port');
  if (!config.sqlitePath) throw new Error('SQLITE_PATH is required');
  if (!Number.isInteger(config.smtpPort) || config.smtpPort < 1 || config.smtpPort > 65535) throw new Error('SMTP_PORT must be a valid TCP port');
  if (config.isProduction) {
    if (config.jwtSecret.length < 32 || config.jwtSecret.includes('local-only')) throw new Error('JWT_SECRET must be a strong production secret');
    if (config.settingsMasterKey.length < 32 || config.settingsMasterKey.includes('local-only')) throw new Error('SETTINGS_MASTER_KEY must be a strong production secret');
    if (!['lax', 'strict', 'none'].includes(config.cookieSameSite)) throw new Error('COOKIE_SAMESITE must be lax, strict, or none');
    if (!config.cookieSecure) throw new Error('COOKIE_SECURE must be true in production');
    if (config.cookieSameSite === 'none' && !config.cookieSecure) throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
    if (!config.appOrigin.startsWith('https://')) throw new Error('APP_ORIGIN or RENDER_EXTERNAL_URL must use HTTPS in production');
    if (config.corsOrigins.some(origin => !origin.startsWith('https://'))) throw new Error('CORS_ORIGINS must use HTTPS in production');
    if (config.devOtpEcho) throw new Error('DEV_OTP_ECHO must be false in production');
    // SMS, SMTP, travel and payment integrations may be configured securely from the admin console.
    // Their adapters return explicit 503/502 errors until a real provider is configured.
  }
}
