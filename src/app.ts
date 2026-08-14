import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { z, ZodError } from 'zod';
import { config } from './config.js';
import { AppError, assert } from './errors.js';
import { createStore, type Store, type TourFilters, type CreateTour, type UpdateTour, type BookingStatus, type Booking, type ContentType, type ContentStatus } from './store.js';
import { hashOtp, issueSession, normalizeIdentity, setAuthCookies, clearAuthCookies, verifyOtpHash, verifyPassword, verifyToken, REFRESH_COOKIE } from './security.js';
import { TravelProvider, MessagingProvider, PaymentProvider, type Vertical } from './providers.js';
import { optionalAuth, requireAuth, requireAdmin, notFound, requestContext } from './middleware.js';
import { rateLimit } from './rate-limit.js';
import { SECRET_MASK } from './secrets.js';

const verticalSchema = z.enum(['flight', 'hotel', 'home', 'visa', 'esim', 'tour']);
const tourStatusSchema = z.enum(['draft', 'published', 'archived']);
const bookingStatusSchema = z.enum(['new', 'reviewing', 'accepted', 'processing', 'pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'failed']);
const contentTypeSchema = z.enum(['homepage', 'destination', 'hotel', 'home', 'visa', 'esim', 'offer', 'airline', 'banner', 'faq', 'company']);
const contentStatusSchema = z.enum(['draft', 'published', 'archived']);
const tourInputSchema = z.object({ slug: z.string().trim().min(3).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().trim().min(3).max(180), country: z.string().trim().min(2).max(80), tourType: z.string().trim().min(2).max(80), destinations: z.array(z.string().trim().min(1).max(80)).min(1).max(20), durationDays: z.number().int().positive().max(60), durationNights: z.number().int().nonnegative().max(59), description: z.string().max(3000).default(''), imageUrl: z.string().max(500).default(''), priceBdt: z.number().nonnegative().max(100000000), status: tourStatusSchema.default('draft'), featured: z.boolean().default(false) });
const tourPatchSchema = tourInputSchema.partial();
const identityRequest = z.object({ identity: z.string().min(3).max(160), fullName: z.string().trim().min(2).max(100).optional(), adminOnly: z.boolean().default(false) });
const verifyOtpRequest = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, 'OTP must be a 6 digit code') });
const bookingRequest = z.object({ vertical: verticalSchema, payload: z.unknown() });
const tourBookingPayload = z.object({ tourId: z.string().uuid(), travellers: z.number().int().min(1).max(30), travelDate: z.string().min(8).max(30) }).passthrough();
const paymentRequest = z.object({ bookingId: z.string().uuid(), amount: z.number().positive().max(10_000_000), currency: z.string().length(3).default('BDT') });
const supportRequest = z.object({ name: z.string().trim().min(2).max(120), mobile: z.string().trim().min(7).max(30), email: z.string().email(), subject: z.string().trim().min(2).max(180) });
const supportPatchRequest = z.object({ status: z.enum(['open', 'pending', 'closed']) });
const trackBookingRequest = z.object({ bookingReference: z.string().uuid(), identity: z.string().min(3).max(160) });
const notificationRequest = z.object({ userId: z.string().optional(), identity: z.string().optional(), allUsers: z.boolean().default(false), title: z.string().trim().min(2).max(160), message: z.string().trim().min(2).max(4000), channels: z.array(z.enum(['in_app', 'sms', 'email'])).min(1).default(['in_app']) });
const isSafeBrandLogo = (value: string) => { if (!value) return true; if (value.startsWith('/')) return true; try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } };
const settingPatchSchema = z.object({ brand_name: z.string().max(120).optional(), brand_logo_url: z.string().max(500).refine(isSafeBrandLogo, 'Logo URL must be an https URL or a local path').optional(), support_email: z.string().email().or(z.literal('')).optional(), support_phone: z.string().max(40).optional(), feature_flights: z.union([z.boolean(), z.enum(['true','false'])]).optional(), feature_hotels: z.union([z.boolean(), z.enum(['true','false'])]).optional(), feature_homes: z.union([z.boolean(), z.enum(['true','false'])]).optional(), feature_visa: z.union([z.boolean(), z.enum(['true','false'])]).optional(), feature_tours: z.union([z.boolean(), z.enum(['true','false'])]).optional(), feature_esim: z.union([z.boolean(), z.enum(['true','false'])]).optional(), payment_provider: z.enum(['sslcommerz', 'bkash']).optional(), payment_webhook_secret: z.string().max(500).optional(), sslcommerz_store_id: z.string().max(160).optional(), sslcommerz_store_password: z.string().max(500).optional(), sslcommerz_api_url: z.string().url().or(z.literal('')).optional(), sslcommerz_validation_url: z.string().url().or(z.literal('')).optional(), sslcommerz_ipn_url: z.string().url().or(z.literal('')).optional(), bkash_base_url: z.string().url().or(z.literal('')).optional(), bkash_app_key: z.string().max(500).optional(), bkash_app_secret: z.string().max(500).optional(), bkash_username: z.string().max(200).optional(), bkash_password: z.string().max(500).optional(), sms_provider: z.enum(['custom_gateway', 'bulksmsbd']).optional(), sms_gateway_url: z.string().url().or(z.literal('')).optional(), sms_gateway_username: z.string().max(200).optional(), sms_gateway_password: z.string().max(500).optional(), sms_api_key: z.string().max(500).optional(), sms_sender_id: z.string().max(120).optional(), smtp_host: z.string().max(200).optional(), smtp_port: z.coerce.number().int().min(1).max(65535).optional(), smtp_user: z.string().max(240).optional(), smtp_password: z.string().max(500).optional(), smtp_from: z.string().email().or(z.literal('')).optional(), travel_provider_url: z.string().url().or(z.literal('')).optional(), travel_provider_api_key: z.string().max(500).optional() }).strict();
const roleRequest = z.object({ role: z.enum(['customer', 'manager', 'admin', 'super_admin']) });
const passwordLoginRequest = z.object({ identity: z.string().email(), password: z.string().min(8).max(200) });
const messageTestRequest = z.object({ destination: z.string().min(3).max(240), subject: z.string().max(160).optional(), message: z.string().min(1).max(4000) });
const adminBookingPatchRequest = z.object({ status: bookingStatusSchema.optional(), internalNote: z.string().max(4000).optional(), ownerId: z.string().uuid().nullable().optional(), request: z.record(z.unknown()).optional() }).strict();
const contentInputSchema = z.object({ type: contentTypeSchema, slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9-]+)*$/), title: z.string().trim().min(2).max(180), subtitle: z.string().max(300).optional(), description: z.string().max(5000).optional(), imageUrl: z.string().max(500).optional(), metadata: z.record(z.unknown()).default({}), status: contentStatusSchema.default('draft'), sortOrder: z.number().int().min(-100000).max(100000).default(0) });
const contentPatchSchema = contentInputSchema.partial();
const FEATURE_KEYS = ['feature_flights','feature_hotels','feature_homes','feature_visa','feature_tours','feature_esim'];
const SETTING_KEYS = ['brand_name','brand_logo_url','support_email','support_phone','payment_provider','payment_webhook_secret','sslcommerz_store_id','sslcommerz_store_password','sslcommerz_api_url','sslcommerz_validation_url','sslcommerz_ipn_url','bkash_base_url','bkash_app_key','bkash_app_secret','bkash_username','bkash_password','sms_provider','sms_gateway_url','sms_gateway_username','sms_gateway_password','sms_api_key','sms_sender_id','smtp_host','smtp_port','smtp_user','smtp_password','smtp_from','travel_provider_url','travel_provider_api_key',...FEATURE_KEYS];
const SETTING_SECRET_KEYS = new Set(['sslcommerz_store_password','payment_webhook_secret','sslcommerz_api_key','bkash_app_key','bkash_app_secret','bkash_username','bkash_password','bkash_token','sms_api_key','sms_gateway_username','sms_gateway_password','smtp_password','travel_provider_api_key','payment_provider_api_key']);
const ADMIN_ROLES = ['admin', 'manager', 'super_admin'] as const;
const PRIVILEGED_ROLES = ['admin', 'super_admin'] as const;

const toInput = (schema: z.ZodTypeAny, value: unknown) => {
  try { return schema.parse(value); } catch (error) { if (error instanceof ZodError) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields', error.flatten()); throw error; }
};
const clientMeta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) });
const isPrivileged = (req: Request) => PRIVILEGED_ROLES.includes(req.user?.role as typeof PRIVILEGED_ROLES[number]);
const assertPrivileged = (req: Request) => assert(isPrivileged(req), 403, 'ADMIN_ONLY', 'Only an admin can perform this operation');
const bookingTransitions: Record<BookingStatus, BookingStatus[]> = {
  new: ['reviewing', 'accepted', 'rejected', 'cancelled'],
  reviewing: ['new', 'accepted', 'rejected', 'cancelled'],
  accepted: ['processing', 'rejected', 'cancelled'],
  processing: ['confirmed', 'rejected', 'cancelled'],
  pending: ['reviewing', 'accepted', 'processing', 'confirmed', 'rejected', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
  failed: ['reviewing', 'cancelled']
};

export function buildApp() {
  const { store } = createStore();
  const travel = new TravelProvider(store);
  const messaging = new MessagingProvider(store);
  const payment = new PaymentProvider(store);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(pinoHttp({ level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] }));
  app.use(requestContext());
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'data:', 'https:'], fontSrc: ["'self'", 'https:', 'data:'], styleSrc: ["'self'", 'https:', "'unsafe-inline'"], scriptSrc: ["'self'"] } } }));
  const corsMiddleware = cors({ origin: (origin, callback) => { if (!origin || config.corsOrigins.includes(origin)) callback(null, true); else callback(new AppError(403, 'CORS_DENIED', 'Origin is not allowed')); }, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'] });
  app.use((req, res, next) => { const origin = req.get('origin'); let sameOrigin = !origin; if (origin) { try { sameOrigin = new URL(origin).host === req.get('host'); } catch { /* Invalid origins are handled by CORS. */ } } if (sameOrigin) return next(); return corsMiddleware(req, res, next); });
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));
  app.use(cookieParser());
  app.use(rateLimit('global', 300, 60));

  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'sadik-travels-api', env: config.nodeEnv }));
  app.get('/readyz', async (_req, res, next) => { try { await store.health(); res.json({ ok: true, database: 'sqlite' }); } catch (error) { next(new AppError(503, 'NOT_READY', 'Service dependencies are not ready', config.isProduction ? undefined : error)); } });
  app.get('/api/v1/site/settings', async (_req, res) => {
    const features: Record<string, boolean> = {};
    for (const key of FEATURE_KEYS) features[key.replace('feature_', '')] = (await store.getSetting(key)) !== 'false';
    const savedLogo = await store.getSetting('brand_logo_url');
    const logoUrl = savedLogo && !savedLogo.includes('SqrRwJyv') ? savedLogo : '/assets/sadik-travels-logo.png?v=3';
    res.json({ brand: await store.getSetting('brand_name') || 'Sadik Travels', logoUrl, support: { email: await store.getSetting('support_email') || '', phone: await store.getSetting('support_phone') || '' }, features });
  });
  app.get('/api/v1/site/content', async (req, res) => { const type = contentTypeSchema.safeParse(String(req.query.type || 'all')); const content = await store.listContent({ type: type.success ? type.data : 'all', q: req.query.q ? String(req.query.q) : undefined }); res.json({ content }); });

  // Authentication: Bangladesh phone OTP first, email OTP as a fallback.
  app.post('/api/v1/auth/password-login', rateLimit('password-login', 10, 300), async (req, res) => { const input = toInput(passwordLoginRequest, req.body); const identity = normalizeIdentity(input.identity).identity; const user = await store.findUserByIdentity(identity); assert(user && ADMIN_ROLES.includes(user.role as typeof ADMIN_ROLES[number]) && user.status === 'active', 401, 'ADMIN_LOGIN_INVALID', 'Invalid admin credentials'); const hash = await store.getPasswordHash(identity); assert(hash && await verifyPassword(input.password, hash), 401, 'ADMIN_LOGIN_INVALID', 'Invalid admin credentials'); const session = await issueSession(store, user, clientMeta(req)); setAuthCookies(res, session.accessToken, session.refreshToken); await store.audit('auth.password_login', { ...clientMeta(req), userId: user.id }); res.json({ accessToken: session.accessToken, expiresIn: config.accessTokenTtl, user }); });

  app.post('/api/v1/auth/request-otp', rateLimit('otp', 5, 300), async (req, res) => {
    const input = toInput(identityRequest, req.body);
    const normalized = normalizeIdentity(input.identity);
    if (input.adminOnly && !config.adminIdentities.includes(normalized.identity)) throw new AppError(403, 'ADMIN_NOT_WHITELISTED', 'This identity is not authorized for admin login');
    const recent = await store.countRecentOtpRequests(normalized.identity, new Date(Date.now() - 60_000));
    assert(recent < 3, 429, 'OTP_THROTTLED', 'Please wait before requesting another code');
    const code = String(randomInt(100000, 1_000_000));
    const challengeId = randomUUID();
    await store.createOtp({ id: challengeId, identity: normalized.identity, channel: normalized.channel, codeHash: await hashOtp(code), attempts: 0, maxAttempts: 5, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), requestIp: req.ip });
    const delivery = await messaging.sendOtp(normalized.channel, normalized.identity, code);
    await store.audit('auth.otp_requested', { ...clientMeta(req), metadata: { channel: normalized.channel } });
    res.status(202).json({ challengeId, channel: normalized.channel, maskedDestination: normalized.channel === 'sms' ? `${normalized.identity.slice(0, 7)}••••` : `${normalized.identity.slice(0, 2)}•••${normalized.identity.slice(normalized.identity.indexOf('@'))}`, expiresIn: 300, ...(delivery.devCode && !config.isProduction ? { devCode: delivery.devCode } : {}) });
  });

  app.post('/api/v1/auth/verify-otp', rateLimit('otp-verify', 15, 300), async (req, res) => {
    const input = toInput(verifyOtpRequest, req.body);
    const challenge = await store.findOtp(input.challengeId);
    assert(challenge, 404, 'OTP_NOT_FOUND', 'This verification code is no longer available');
    assert(!challenge.consumedAt, 400, 'OTP_USED', 'This verification code has already been used');
    assert(new Date(challenge.expiresAt) > new Date(), 400, 'OTP_EXPIRED', 'This verification code has expired');
    assert(challenge.attempts < challenge.maxAttempts, 429, 'OTP_LOCKED', 'Too many incorrect attempts');
    const valid = await verifyOtpHash(input.code, challenge.codeHash);
    if (!valid) { const updated = await store.incrementOtpAttempts(challenge.id); const remaining = Math.max(0, (updated?.maxAttempts ?? challenge.maxAttempts) - (updated?.attempts ?? challenge.attempts + 1)); throw new AppError(400, 'OTP_INVALID', remaining ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Too many incorrect attempts'); }
    await store.consumeOtp(challenge.id);
    const isConfiguredAdmin = config.adminIdentities.includes(challenge.identity);
    let user = await store.findUserByIdentity(challenge.identity);
    if (!user) user = await store.createUser({ identity: challenge.identity, channel: challenge.channel, role: isConfiguredAdmin ? 'admin' : 'customer' });
    else if (isConfiguredAdmin && !['admin', 'super_admin'].includes(user.role)) user = (await store.setUserRole(user.id, 'admin')) ?? user;
    const session = await issueSession(store, user, clientMeta(req));
    setAuthCookies(res, session.accessToken, session.refreshToken);
    await store.audit('auth.login', { ...clientMeta(req), userId: user.id, metadata: { channel: challenge.channel } });
    res.json({ accessToken: session.accessToken, expiresIn: config.accessTokenTtl, user });
  });

  app.post('/api/v1/auth/refresh', rateLimit('refresh', 30, 60), async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Refresh login is required');
    const claims = await verifyToken(token, 'refresh');
    const existing = await store.findSessionByRefreshJti(claims.jti);
    assert(existing && existing.id === claims.sid && existing.userId === claims.sub && !existing.revokedAt && new Date(existing.expiresAt) > new Date(), 401, 'SESSION_INVALID', 'Your session has expired. Please login again.');
    const user = await store.findUserById(existing.userId);
    assert(user && user.status === 'active', 403, 'ACCOUNT_UNAVAILABLE', 'This account is not available');
    await store.revokeSession(existing.id);
    const next = await issueSession(store, user, clientMeta(req));
    setAuthCookies(res, next.accessToken, next.refreshToken);
    res.json({ accessToken: next.accessToken, expiresIn: config.accessTokenTtl, user });
  });
  app.post('/api/v1/auth/logout', async (req, res, next) => { try { const token = req.cookies?.[REFRESH_COOKIE] as string | undefined; if (token) { try { const claims = await verifyToken(token, 'refresh'); await store.revokeSession(claims.sid); } catch { /* Always clear local cookies. */ } } clearAuthCookies(res); res.status(204).send(); } catch (error) { next(error); } });
  app.get('/api/v1/auth/me', requireAuth(store), (req, res) => res.json({ user: req.user }));
  app.get('/api/v1/notifications', requireAuth(store), async (req, res) => { const notifications = await store.listNotifications(req.user!.id); res.json({ notifications, unread: notifications.filter(item => !item.readAt).length }); });
  app.patch('/api/v1/notifications/:id/read', requireAuth(store), async (req, res) => { const notification = await store.markNotificationRead(String(req.params.id), req.user!.id); assert(notification, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found'); res.json({ notification }); });

  // Public tour catalogue and live provider search.
  app.get('/api/v1/tours', rateLimit('tour-catalog', 120, 60), optionalAuth(store), async (req, res) => { const filters: TourFilters = { q: req.query.q ? String(req.query.q) : undefined, country: req.query.destination ? String(req.query.destination) : undefined, tourType: req.query.tour_type ? String(req.query.tour_type) : undefined, maxPrice: req.query.max_price ? Number(req.query.max_price) : undefined, sort: req.query.sort === 'price_asc' || req.query.sort === 'price_desc' ? req.query.sort : 'newest' }; const tours = await store.listTours(filters); res.json({ success: true, filters, count: tours.length, tours }); });
  app.get('/api/v1/tours/:idOrSlug', rateLimit('tour-detail', 120, 60), async (req, res) => { const tour = await store.findTour(String(req.params.idOrSlug)); assert(tour && tour.status === 'published', 404, 'TOUR_NOT_FOUND', 'Tour package not found'); res.json({ tour }); });
  app.post('/api/v1/search/:vertical', rateLimit('search', 90, 60), optionalAuth(store), async (req, res) => {
    const vertical = toInput(verticalSchema, String(req.params.vertical)) as Vertical;
    const payload = toInput(z.record(z.unknown()), req.body ?? {});
    if (vertical === 'tour') { const tours = await store.listTours({ q: typeof payload.q === 'string' ? payload.q : undefined, country: typeof payload.destination === 'string' ? payload.destination : undefined, tourType: typeof payload.tourType === 'string' ? payload.tourType : undefined, maxPrice: typeof payload.maxPrice === 'number' ? payload.maxPrice : undefined, sort: payload.sort === 'price_asc' || payload.sort === 'price_desc' ? payload.sort : 'newest' }); await store.audit('search.tour', { ...clientMeta(req), userId: req.user?.id, metadata: { keys: Object.keys(payload) } }); res.json({ success: true, vertical, searchId: `TOUR-${Date.now().toString(36).toUpperCase()}`, results: tours }); return; }
    const raw = await travel.search(vertical, payload);
    const result = Array.isArray(raw) ? { results: raw } : (raw && typeof raw === 'object' ? raw : { results: [] });
    await store.audit(`search.${vertical}`, { ...clientMeta(req), userId: req.user?.id, metadata: { keys: Object.keys(payload) } });
    res.json({ success: true, vertical, ...result as Record<string, unknown> });
  });

  // Admin access and operational dashboard.
  app.get('/api/v1/admin/me', requireAdmin(store), (req, res) => res.json({ user: req.user, permissions: ['dashboard:read', 'bookings:read', 'bookings:write', 'tours:read', 'tours:write', 'tours:archive', 'content:write', 'settings:read', 'settings:write', 'notifications:send'] }));
  app.get('/api/v1/admin/stats', requireAdmin(store), async (_req, res) => { const stats = await store.adminStats(); const recent = await store.listAdminBookings({ page: 1, pageSize: 8 }); res.json({ ...stats, tours: stats.tours, recentBookings: recent.bookings, recentActivity: await store.listAuditLogs(12) }); });
  app.get('/api/v1/admin/activity', requireAdmin(store), async (_req, res) => res.json({ activity: await store.listAuditLogs(50) }));
  app.get('/api/v1/admin/users', requireAdmin(store), async (_req, res) => res.json({ users: await store.listUsers() }));
  app.patch('/api/v1/admin/users/:id/role', requireAdmin(store), async (req, res) => { assertPrivileged(req); const input = toInput(roleRequest, req.body); const target = await store.findUserById(String(req.params.id)); assert(target, 404, 'USER_NOT_FOUND', 'User not found'); assert(target.id !== req.user!.id || input.role === 'super_admin', 409, 'SELF_ROLE_CHANGE_BLOCKED', 'You cannot remove your own admin access'); assert(req.user!.role === 'super_admin' || input.role !== 'super_admin', 403, 'SUPER_ADMIN_REQUIRED', 'Only a super admin can grant super-admin access'); const user = await store.setUserRole(target.id, input.role); res.json({ user }); });

  app.get('/api/v1/admin/settings', requireAdmin(store), async (_req, res) => { const saved = new Map((await store.getAdminSettings()).map(item => [item.key, item])); const settings = await Promise.all(SETTING_KEYS.map(async key => { const item = saved.get(key); if (item) return item; const value = await store.getSetting(key); return { key, configured: Boolean(value), secret: SETTING_SECRET_KEYS.has(key), ...(SETTING_SECRET_KEYS.has(key) ? { masked: value ? SECRET_MASK : '' } : { value: value ?? '' }) }; })); res.json({ settings }); });
  app.put('/api/v1/admin/settings', requireAdmin(store), async (req, res) => { assertPrivileged(req); const input = toInput(settingPatchSchema, req.body) as Record<string, string | undefined>; const patch = Object.fromEntries(Object.entries(input).filter(([key, value]) => value !== undefined && !(SETTING_SECRET_KEYS.has(key) && value === SECRET_MASK)).map(([key, value]) => [key, typeof value === 'boolean' ? String(value) : value])); await store.updateSettings(patch, req.user!.id); await store.audit('admin.settings_updated', { ...clientMeta(req), userId: req.user!.id, metadata: { keys: Object.keys(patch) } }); res.json({ settings: await store.getAdminSettings() }); });
  app.post('/api/v1/admin/settings/test-sms', requireAdmin(store), async (req, res) => { assertPrivileged(req); const input = toInput(messageTestRequest, req.body); const result = await messaging.sendSms(input.destination, input.message); res.json({ sent: true, result }); });
  app.post('/api/v1/admin/settings/test-email', requireAdmin(store), async (req, res) => { assertPrivileged(req); const input = toInput(messageTestRequest, req.body); const result = await messaging.sendEmail(input.destination, input.subject || 'Sadik Travels test email', input.message); res.json({ sent: true, result }); });

  // Booking assignment and lifecycle controls. Claiming is atomic at the database layer.
  app.get('/api/v1/admin/bookings', requireAdmin(store), async (req, res) => { const status = bookingStatusSchema.safeParse(String(req.query.status || '')); const vertical = verticalSchema.safeParse(String(req.query.vertical || '')); const result = await store.listAdminBookings({ q: req.query.q ? String(req.query.q) : undefined, status: status.success ? status.data : 'all', vertical: vertical.success ? vertical.data : 'all', ownerId: req.query.ownerId ? String(req.query.ownerId) : undefined, page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 20 }); res.json(result); });
  app.get('/api/v1/admin/bookings/:id', requireAdmin(store), async (req, res) => { const result = await store.listAdminBookings({ q: String(req.params.id), page: 1, pageSize: 1 }); const booking = result.bookings[0]; assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); res.json({ booking, history: await store.listBookingEvents(booking.id) }); });
  app.post('/api/v1/admin/bookings/:id/claim', requireAdmin(store), async (req, res) => { const existing = await store.findBooking(String(req.params.id)); assert(existing, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); if (existing.ownerId && existing.ownerId !== req.user!.id) throw new AppError(409, 'BOOKING_ALREADY_CLAIMED', 'This booking is already assigned to another operator'); const booking = await store.claimBooking(existing.id, req.user!.id); assert(booking, 409, 'BOOKING_ALREADY_CLAIMED', 'This booking is already assigned to another operator'); await store.audit('admin.booking_claimed', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: existing.id } }); res.json({ booking }); });
  app.post('/api/v1/admin/bookings/:id/release', requireAdmin(store), async (req, res) => { const existing = await store.findBooking(String(req.params.id)); assert(existing, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); const booking = await store.releaseBooking(existing.id, req.user!.id, isPrivileged(req)); assert(booking, 403, 'BOOKING_OWNER_REQUIRED', 'Only the assigned operator can release this booking'); await store.audit('admin.booking_released', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: existing.id } }); res.json({ booking }); });
  app.patch('/api/v1/admin/bookings/:id', requireAdmin(store), async (req, res) => { const input = toInput(adminBookingPatchRequest, req.body); const existing = await store.findBooking(String(req.params.id)); assert(existing, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); assert(isPrivileged(req) || existing.ownerId === req.user!.id, 403, 'BOOKING_OWNER_REQUIRED', 'Claim this booking before changing it'); if (input.ownerId !== undefined) { assertPrivileged(req); if (input.ownerId) { const assignee = await store.findUserById(input.ownerId); assert(assignee && ['manager', 'admin', 'super_admin'].includes(assignee.role) && assignee.status === 'active', 400, 'INVALID_ASSIGNEE', 'Choose an active admin or manager'); } } if (input.status && input.status !== existing.status) { assert(bookingTransitions[existing.status].includes(input.status), 409, 'INVALID_BOOKING_TRANSITION', `A ${existing.status} booking cannot move directly to ${input.status}`); } const action = input.ownerId !== undefined ? 'assignee_changed' : input.request !== undefined ? 'request_updated' : input.status ? 'status_changed' : 'note_added'; const booking = await store.updateAdminBooking(existing.id, { status: input.status, internalNote: input.internalNote, ownerId: input.ownerId, request: input.request }, req.user!.id, action); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); await store.audit('admin.booking_updated', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: existing.id, status: input.status, ownerId: input.ownerId } }); res.json({ booking, history: await store.listBookingEvents(existing.id) }); });

  app.get('/api/v1/admin/tickets', requireAdmin(store), async (req, res) => res.json({ tickets: await store.listSupportTickets({ status: req.query.status === 'open' || req.query.status === 'pending' || req.query.status === 'closed' ? req.query.status : 'all', q: req.query.q ? String(req.query.q) : undefined }) }));
  app.patch('/api/v1/admin/tickets/:id', requireAdmin(store), async (req, res) => { const input = toInput(supportPatchRequest, req.body); const ticket = await store.updateSupportTicket(String(req.params.id), input); assert(ticket, 404, 'TICKET_NOT_FOUND', 'Support ticket not found'); await store.audit('admin.ticket_updated', { ...clientMeta(req), userId: req.user!.id, metadata: { ticketId: ticket.id, status: ticket.status } }); res.json({ ticket }); });

  app.get('/api/v1/admin/content', requireAdmin(store), async (req, res) => { const type = contentTypeSchema.safeParse(String(req.query.type || '')); const status = contentStatusSchema.safeParse(String(req.query.status || '')); res.json({ content: await store.listContent({ type: type.success ? type.data : 'all', status: status.success ? status.data : 'all', q: req.query.q ? String(req.query.q) : undefined, includeArchived: true }) }); });
  app.post('/api/v1/admin/content', requireAdmin(store), async (req, res) => { assertPrivileged(req); const input = toInput(contentInputSchema, req.body); const item = await store.createContent({ ...input, createdBy: req.user!.id }); await store.audit('admin.content_created', { ...clientMeta(req), userId: req.user!.id, metadata: { contentId: item.id, type: item.type } }); res.status(201).json({ content: item }); });
  app.patch('/api/v1/admin/content/:id', requireAdmin(store), async (req, res) => { assertPrivileged(req); const input = toInput(contentPatchSchema, req.body); const item = await store.updateContent(String(req.params.id), input); assert(item, 404, 'CONTENT_NOT_FOUND', 'Content item not found'); await store.audit('admin.content_updated', { ...clientMeta(req), userId: req.user!.id, metadata: { contentId: item.id, type: item.type } }); res.json({ content: item }); });
  app.delete('/api/v1/admin/content/:id', requireAdmin(store), async (req, res) => { assertPrivileged(req); const item = await store.archiveContent(String(req.params.id)); assert(item, 404, 'CONTENT_NOT_FOUND', 'Content item not found'); await store.audit('admin.content_archived', { ...clientMeta(req), userId: req.user!.id, metadata: { contentId: item.id } }); res.json({ content: item }); });

  app.get('/api/v1/admin/tours', requireAdmin(store), async (req, res) => { const filters: TourFilters = { q: req.query.q ? String(req.query.q) : undefined, country: req.query.country ? String(req.query.country) : undefined, tourType: req.query.tourType ? String(req.query.tourType) : undefined, status: req.query.status === 'draft' || req.query.status === 'published' || req.query.status === 'archived' ? req.query.status : undefined, sort: req.query.sort === 'price_asc' || req.query.sort === 'price_desc' ? req.query.sort : 'newest' }; res.json({ tours: await store.listTours(filters) }); });
  app.post('/api/v1/admin/tours', requireAdmin(store), async (req, res) => { const input = toInput(tourInputSchema, req.body) as CreateTour; const tour = await store.createTour({ ...input, createdBy: req.user!.id }); await store.audit('admin.tour_created', { ...clientMeta(req), userId: req.user!.id, metadata: { tourId: tour.id } }); res.status(201).json({ tour }); });
  app.patch('/api/v1/admin/tours/:id', requireAdmin(store), async (req, res) => { const input = toInput(tourPatchSchema, req.body) as UpdateTour; const tour = await store.updateTour(String(req.params.id), input); assert(tour, 404, 'TOUR_NOT_FOUND', 'Tour package not found'); await store.audit('admin.tour_updated', { ...clientMeta(req), userId: req.user!.id, metadata: { tourId: tour.id } }); res.json({ tour }); });
  app.delete('/api/v1/admin/tours/:id', requireAdmin(store), async (req, res) => { const tour = await store.archiveTour(String(req.params.id)); assert(tour, 404, 'TOUR_NOT_FOUND', 'Tour package not found'); await store.audit('admin.tour_archived', { ...clientMeta(req), userId: req.user!.id, metadata: { tourId: tour.id } }); res.json({ tour }); });

  app.post('/api/v1/admin/notifications', requireAdmin(store), async (req, res) => { const input = toInput(notificationRequest, req.body); const normalizedRecipient = input.identity ? normalizeIdentity(input.identity).identity : undefined; const recipients = input.allUsers ? await store.listUsers() : [input.userId ? await store.findUserById(input.userId) : normalizedRecipient ? await store.findUserByIdentity(normalizedRecipient) : undefined].filter(Boolean); assert(recipients.length > 0, 404, 'RECIPIENT_NOT_FOUND', 'No notification recipient was found'); const sent: string[] = []; for (const recipient of recipients) { const user = recipient!; await store.createNotification({ userId: user.id, title: input.title, message: input.message, channels: input.channels }); if (input.channels.includes('sms')) { assert(user.phone, 400, 'RECIPIENT_PHONE_MISSING', 'A phone number is required for SMS delivery'); await messaging.sendNotification('sms', user.phone, input.title, input.message); } if (input.channels.includes('email')) { assert(user.email, 400, 'RECIPIENT_EMAIL_MISSING', 'An email address is required for email delivery'); await messaging.sendNotification('email', user.email, input.title, input.message); } sent.push(user.id); } await store.audit('admin.notification_sent', { ...clientMeta(req), userId: req.user!.id, metadata: { recipients: sent.length, channels: input.channels } }); res.status(201).json({ sent: sent.length, channels: input.channels }); });

  // Booking creation: tour requests are persisted for operator review; all other verticals require a live supplier adapter.
  app.post('/api/v1/bookings', requireAuth(store), async (req, res) => {
    const input = toInput(bookingRequest, req.body);
    const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload as Record<string, unknown> : { value: input.payload };
    if (input.vertical === 'tour') {
      const tourPayload = toInput(tourBookingPayload, payload);
      const tour = await store.findTour(tourPayload.tourId);
      assert(tour && tour.status === 'published', 404, 'TOUR_NOT_FOUND', 'This tour package is no longer available');
      const booking = await store.createBooking({ userId: req.user!.id, vertical: 'tour', status: 'new', request: { ...tourPayload, tourId: tour.id, title: tour.title, priceBdt: tour.priceBdt } });
      await store.audit('booking.created', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: booking.id, vertical: input.vertical, workflow: 'operator_review' } });
      res.status(201).json({ booking });
      return;
    }
    const booking = await store.createBooking({ userId: req.user!.id, vertical: input.vertical, request: payload, status: 'pending' });
    try {
      const providerResponse: any = await travel.reserve(input.vertical, { ...payload, bookingId: booking.id, customerId: req.user!.id });
      const status: BookingStatus = providerResponse?.status === 'confirmed' ? 'confirmed' : 'pending';
      const updated = await store.updateBooking(booking.id, { status, providerRef: providerResponse?.providerRef, response: providerResponse });
      await store.audit('booking.created', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: booking.id, vertical: input.vertical } });
      res.status(201).json({ booking: updated ?? booking });
    } catch (error) { await store.updateBooking(booking.id, { status: 'failed', response: { error: 'provider_failure' } }); throw error; }
  });
  app.get('/api/v1/bookings', requireAuth(store), async (req, res) => res.json({ bookings: await store.listBookings(req.user!.id) }));
  app.post('/api/v1/bookings/track', rateLimit('booking-track', 30, 60), async (req, res) => { const input = toInput(trackBookingRequest, req.body); const identity = normalizeIdentity(input.identity).identity; const booking = await store.findBookingForTracking(input.bookingReference, identity); assert(booking, 404, 'BOOKING_NOT_FOUND', 'No booking matched that reference and contact'); res.json({ booking: { id: booking.id, vertical: booking.vertical, status: booking.status, providerRef: booking.providerRef, request: booking.request, response: booking.response, createdAt: booking.createdAt, updatedAt: booking.updatedAt } }); });
  app.get('/api/v1/bookings/:id', requireAuth(store), async (req, res) => { const booking = await store.findBooking(String(req.params.id), req.user!.id); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); res.json({ booking }); });
  app.post('/api/v1/bookings/:id/cancel', requireAuth(store), async (req, res) => { const booking = await store.findBooking(String(req.params.id), req.user!.id); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); assert(['new','reviewing','accepted','processing','pending','confirmed'].includes(booking.status), 409, 'BOOKING_NOT_CANCELLABLE', 'This booking cannot be cancelled at its current stage'); let result: unknown = { cancelledLocally: true }; if (booking.vertical !== 'tour' && booking.providerRef) result = await travel.cancel(booking.vertical, { bookingId: booking.id, providerRef: booking.providerRef, reason: (req.body as any)?.reason }); const updated = await store.updateBooking(booking.id, { status: 'cancelled', response: result }); await store.addBookingEvent({ bookingId: booking.id, actorId: req.user!.id, action: 'customer_cancelled', fromStatus: booking.status, toStatus: 'cancelled', note: (req.body as any)?.reason }); await store.audit('booking.cancelled', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: booking.id } }); res.json({ booking: updated ?? booking }); });

  app.post('/api/v1/payments/intents', requireAuth(store), async (req, res) => { const input = toInput(paymentRequest, req.body); const booking = await store.findBooking(input.bookingId, req.user!.id); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); assert(!['cancelled', 'rejected', 'new', 'reviewing', 'failed'].includes(booking.status), 409, 'BOOKING_NOT_PAYABLE', 'This booking is not ready for payment'); const paymentRecord = await store.createPayment({ bookingId: booking.id, userId: req.user!.id, provider: 'configured', amount: input.amount, currency: input.currency.toUpperCase(), status: 'created' }); const providerResponse: any = await payment.createIntent({ paymentId: paymentRecord.id, bookingId: booking.id, amount: input.amount, currency: input.currency.toUpperCase(), customerId: req.user!.id, returnUrl: `${config.appOrigin}/payment/return` }); const updated = await store.updatePayment(paymentRecord.id, { status: providerResponse?.status === 'paid' ? 'paid' : 'pending', transactionRef: providerResponse?.transactionRef, providerPayload: providerResponse }); res.status(201).json({ payment: updated ?? paymentRecord, checkoutUrl: providerResponse?.checkoutUrl }); });
  app.post('/api/v1/payments/webhook', async (req, res) => { assert(await payment.verifyWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), req.header('x-payment-signature')), 401, 'INVALID_WEBHOOK', 'Invalid payment webhook signature'); const payload = req.body as { paymentId?: string; status?: string; transactionRef?: string }; assert(payload.paymentId && payload.status, 400, 'INVALID_WEBHOOK', 'Payment webhook payload is incomplete'); const status = payload.status === 'paid' ? 'paid' : payload.status === 'refunded' ? 'refunded' : payload.status === 'failed' ? 'failed' : 'pending'; const updated = await store.updatePayment(payload.paymentId, { status, transactionRef: payload.transactionRef, providerPayload: payload }); assert(updated, 404, 'PAYMENT_NOT_FOUND', 'Payment not found'); if (status === 'paid') { const booking = await store.findBooking(updated.bookingId); if (booking) { await store.updateBooking(updated.bookingId, { status: 'confirmed' }); await store.addBookingEvent({ bookingId: updated.bookingId, action: 'payment_confirmed', fromStatus: booking.status, toStatus: 'confirmed' }); } } res.json({ received: true }); });

  app.post('/api/v1/support/tickets', optionalAuth(store), rateLimit('support', 20, 60), async (req, res) => { const input = toInput(supportRequest, req.body); const ticket = await store.createSupportTicket({ ...input, userId: req.user?.id }); await store.audit('support.ticket_created', { ...clientMeta(req), userId: req.user?.id, metadata: { ticketId: ticket.id } }); res.status(201).json({ ticket: { id: ticket.id, status: ticket.status, createdAt: ticket.createdAt } }); });

  if (!config.serveStatic) app.get('/', (_req, res) => res.json({ service: 'Sadik Travels backend', status: 'online', health: '/healthz', ready: '/readyz' }));
  if (config.serveStatic) { app.get('/admin', (_req, res) => res.sendFile(path.join(config.publicDir, 'admin.html'))); app.use(express.static(config.publicDir, { index: 'index.html', maxAge: config.isProduction ? '1h' : 0 })); app.get(/^(?!\/api\/|\/healthz$|\/readyz$).*/, (_req, res) => res.sendFile(path.join(config.publicDir, 'index.html'))); }
  app.use(notFound);
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const parseError = error instanceof SyntaxError && Number((error as any).status) === 400;
    const normalized = error instanceof AppError ? error : error instanceof ZodError ? new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields', error.flatten()) : parseError ? new AppError(400, 'INVALID_JSON', 'The request body contains invalid JSON') : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    if ((req as any).log) (req as any).log.error({ err: error, requestId: req.requestId, code: normalized.code }, normalized.message);
    res.status(normalized.statusCode).json({ error: { code: normalized.code, message: normalized.expose ? normalized.message : 'An unexpected error occurred', ...(normalized.expose && normalized.details ? { details: normalized.details } : {}) }, requestId: req.requestId });
  });
  return { app, store };
}
