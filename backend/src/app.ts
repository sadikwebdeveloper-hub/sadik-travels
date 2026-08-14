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
import { createStore, type Store, type TourFilters, type CreateTour, type UpdateTour } from './store.js';
import { hashOtp, issueSession, normalizeIdentity, setAuthCookies, clearAuthCookies, verifyOtpHash, verifyToken, REFRESH_COOKIE } from './security.js';
import { TravelProvider, MessagingProvider, PaymentProvider, type Vertical } from './providers.js';
import { optionalAuth, requireAuth, requireAdmin, notFound, requestContext } from './middleware.js';
import { rateLimit } from './rate-limit.js';

const verticalSchema = z.enum(['flight', 'hotel', 'home', 'visa', 'esim', 'tour']);
const tourStatusSchema = z.enum(['draft', 'published', 'archived']);
const tourInputSchema = z.object({ slug: z.string().trim().min(3).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), title: z.string().trim().min(3).max(180), country: z.string().trim().min(2).max(80), tourType: z.string().trim().min(2).max(80), destinations: z.array(z.string().trim().min(1).max(80)).min(1).max(20), durationDays: z.number().int().positive().max(60), durationNights: z.number().int().nonnegative().max(59), description: z.string().max(3000).default(''), imageUrl: z.string().max(500).default(''), priceBdt: z.number().nonnegative().max(100000000), status: tourStatusSchema.default('draft'), featured: z.boolean().default(false) });
const tourPatchSchema = tourInputSchema.partial();
const identityRequest = z.object({ identity: z.string().min(3).max(160), fullName: z.string().trim().min(2).max(100).optional() });
const verifyOtpRequest = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, 'OTP must be a 6 digit code') });
const bookingRequest = z.object({ vertical: verticalSchema, payload: z.unknown() });
const paymentRequest = z.object({ bookingId: z.string().uuid(), amount: z.number().positive().max(10_000_000), currency: z.string().length(3).default('BDT') });
const supportRequest = z.object({ name: z.string().trim().min(2).max(120), mobile: z.string().trim().min(7).max(30), email: z.string().email(), subject: z.string().trim().min(2).max(180) });
const notificationRequest = z.object({ userId: z.string().optional(), identity: z.string().optional(), allUsers: z.boolean().default(false), title: z.string().trim().min(2).max(160), message: z.string().trim().min(2).max(4000), channels: z.array(z.enum(['in_app', 'sms', 'email'])).min(1).default(['in_app']) });

const toInput = (schema: z.ZodTypeAny, value: unknown) => {
  try { return schema.parse(value); } catch (error) { if (error instanceof ZodError) throw new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields', error.flatten()); throw error; }
};
const clientMeta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 500) });

export function buildApp() {
  const { store, connection } = createStore();
  const travel = new TravelProvider();
  const messaging = new MessagingProvider();
  const payment = new PaymentProvider();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(pinoHttp({ level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] }));
  app.use(requestContext());
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: (origin, callback) => { if (!origin || config.corsOrigins.includes(origin)) callback(null, true); else callback(new AppError(403, 'CORS_DENIED', 'Origin is not allowed')); }, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'] }));
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }));
  app.use(cookieParser());
  app.use(rateLimit('global', 300, 60));

  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'sadik-travels-api', env: config.nodeEnv }));
  app.get('/readyz', async (_req, res, next) => { try { await store.health(); res.json({ ok: true, database: config.dataMode }); } catch (error) { next(new AppError(503, 'NOT_READY', 'Service dependencies are not ready', config.isProduction ? undefined : error)); } });

  // Authentication: Bangladesh phone OTP first, email OTP as a fallback.
  app.post('/api/v1/auth/request-otp', rateLimit('otp', 5, 300), async (req, res) => {
    const input = toInput(identityRequest, req.body);
    const normalized = normalizeIdentity(input.identity);
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
    else if (isConfiguredAdmin && user.role !== 'admin') user = (await store.setUserRole(user.id, 'admin')) ?? user;
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

  app.post('/api/v1/auth/logout', async (req, res, next) => {
    try {
      const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
      if (token) { try { const claims = await verifyToken(token, 'refresh'); await store.revokeSession(claims.sid); } catch { /* Always clear local cookies. */ } }
      clearAuthCookies(res); res.status(204).send();
    } catch (error) { next(error); }
  });
  app.get('/api/v1/auth/me', requireAuth(store), (req, res) => res.json({ user: req.user }));
  app.get('/api/v1/notifications', requireAuth(store), async (req, res) => { const notifications = await store.listNotifications(req.user!.id); res.json({ notifications, unread: notifications.filter(item => !item.readAt).length }); });
  app.patch('/api/v1/notifications/:id/read', requireAuth(store), async (req, res) => { const notification = await store.markNotificationRead(String(req.params.id), req.user!.id); assert(notification, 404, 'NOTIFICATION_NOT_FOUND', 'Notification not found'); res.json({ notification }); });

  // Public tour catalog and reference-style search results.
  app.get('/api/v1/tours', rateLimit('tour-catalog', 120, 60), optionalAuth(store), async (req, res) => {
    const filters: TourFilters = { q: req.query.q ? String(req.query.q) : undefined, country: req.query.destination ? String(req.query.destination) : undefined, tourType: req.query.tour_type ? String(req.query.tour_type) : undefined, maxPrice: req.query.max_price ? Number(req.query.max_price) : undefined, sort: req.query.sort === 'price_asc' || req.query.sort === 'price_desc' ? req.query.sort : 'newest' };
    const tours = await store.listTours(filters);
    res.json({ success: true, filters, count: tours.length, tours });
  });
  app.get('/api/v1/tours/:idOrSlug', rateLimit('tour-detail', 120, 60), async (req, res) => { const tour = await store.findTour(String(req.params.idOrSlug)); assert(tour && tour.status === 'published', 404, 'TOUR_NOT_FOUND', 'Tour package not found'); res.json({ tour }); });

  // Search is public; real production provider adapters are required in production.
  app.post('/api/v1/search/:vertical', rateLimit('search', 90, 60), optionalAuth(store), async (req, res) => {
    const vertical = toInput(verticalSchema, String(req.params.vertical)) as Vertical;
    const payload = toInput(z.record(z.unknown()), req.body ?? {});
    if (vertical === 'tour') {
      const tours = await store.listTours({ q: typeof payload.q === 'string' ? payload.q : undefined, country: typeof payload.destination === 'string' ? payload.destination : undefined, tourType: typeof payload.tourType === 'string' ? payload.tourType : undefined, maxPrice: typeof payload.maxPrice === 'number' ? payload.maxPrice : undefined, sort: payload.sort === 'price_asc' || payload.sort === 'price_desc' ? payload.sort : 'newest' });
      await store.audit('search.tour', { ...clientMeta(req), userId: req.user?.id, metadata: { keys: Object.keys(payload) } });
      res.json({ success: true, vertical, searchId: `TOUR-${Date.now().toString(36).toUpperCase()}`, results: tours });
      return;
    }
    const result = await travel.search(vertical, payload);
    await store.audit(`search.${vertical}`, { ...clientMeta(req), userId: req.user?.id, metadata: { keys: Object.keys(payload) } });
    res.json({ success: true, vertical, ...result as Record<string, unknown> });
  });


  // Admin catalogue management. Admin identities are configured with ADMIN_IDENTITIES.
  app.get('/api/v1/admin/me', requireAdmin(store), (req, res) => res.json({ user: req.user, permissions: ['tours:read', 'tours:write', 'tours:archive'] }));
  app.get('/api/v1/admin/stats', requireAdmin(store), async (_req, res) => res.json({ tours: await store.tourStats() }));
  app.get('/api/v1/admin/tours', requireAdmin(store), async (req, res) => {
    const filters: TourFilters = { q: req.query.q ? String(req.query.q) : undefined, country: req.query.country ? String(req.query.country) : undefined, tourType: req.query.tourType ? String(req.query.tourType) : undefined, status: req.query.status === 'draft' || req.query.status === 'published' || req.query.status === 'archived' ? req.query.status : undefined, sort: req.query.sort === 'price_asc' || req.query.sort === 'price_desc' ? req.query.sort : 'newest' };
    res.json({ tours: await store.listTours(filters) });
  });
  app.post('/api/v1/admin/tours', requireAdmin(store), async (req, res) => {
    const input = toInput(tourInputSchema, req.body) as CreateTour;
    const tour = await store.createTour({ ...input, createdBy: req.user!.id });
    await store.audit('admin.tour_created', { ...clientMeta(req), userId: req.user!.id, metadata: { tourId: tour.id } });
    res.status(201).json({ tour });
  });
  app.patch('/api/v1/admin/tours/:id', requireAdmin(store), async (req, res) => {
    const input = toInput(tourPatchSchema, req.body) as UpdateTour;
    const tour = await store.updateTour(String(req.params.id), input);
    assert(tour, 404, 'TOUR_NOT_FOUND', 'Tour package not found');
    await store.audit('admin.tour_updated', { ...clientMeta(req), userId: req.user!.id, metadata: { tourId: tour.id } });
    res.json({ tour });
  });
  app.delete('/api/v1/admin/tours/:id', requireAdmin(store), async (req, res) => {
    const tour = await store.archiveTour(String(req.params.id));
    assert(tour, 404, 'TOUR_NOT_FOUND', 'Tour package not found');
    await store.audit('admin.tour_archived', { ...clientMeta(req), userId: req.user!.id, metadata: { tourId: tour.id } });
    res.json({ tour });
  });
  app.post('/api/v1/admin/notifications', requireAdmin(store), async (req, res) => {
    const input = toInput(notificationRequest, req.body);
    const normalizedRecipient = input.identity ? normalizeIdentity(input.identity).identity : undefined;
    const recipients = input.allUsers ? await store.listUsers() : [input.userId ? await store.findUserById(input.userId) : normalizedRecipient ? await store.findUserByIdentity(normalizedRecipient) : undefined].filter(Boolean);
    assert(recipients.length > 0, 404, 'RECIPIENT_NOT_FOUND', 'No notification recipient was found');
    const sent: string[] = [];
    for (const recipient of recipients) {
      const user = recipient!;
      await store.createNotification({ userId: user.id, title: input.title, message: input.message, channels: input.channels });
      if (input.channels.includes('sms')) { assert(user.phone, 400, 'RECIPIENT_PHONE_MISSING', 'A phone number is required for SMS delivery'); await messaging.sendNotification('sms', user.phone, input.title, input.message); }
      if (input.channels.includes('email')) { assert(user.email, 400, 'RECIPIENT_EMAIL_MISSING', 'An email address is required for email delivery'); await messaging.sendNotification('email', user.email, input.title, input.message); }
      sent.push(user.id);
    }
    await store.audit('admin.notification_sent', { ...clientMeta(req), userId: req.user!.id, metadata: { recipients: sent.length, channels: input.channels } });
    res.status(201).json({ sent: sent.length, channels: input.channels });
  });
  app.post('/api/v1/bookings', requireAuth(store), async (req, res) => {
    const input = toInput(bookingRequest, req.body);
    const booking = await store.createBooking({ userId: req.user!.id, vertical: input.vertical, request: input.payload });
    try {
      const providerResponse: any = await travel.reserve(input.vertical, { ...input.payload as object, bookingId: booking.id, customerId: req.user!.id });
      const status = providerResponse?.status === 'confirmed' ? 'confirmed' : 'pending';
      const updated = await store.updateBooking(booking.id, { status, providerRef: providerResponse?.providerRef, response: providerResponse });
      await store.audit('booking.created', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: booking.id, vertical: input.vertical } });
      res.status(201).json({ booking: updated ?? booking });
    } catch (error) { await store.updateBooking(booking.id, { status: 'failed', response: { error: 'provider_failure' } }); throw error; }
  });
  app.get('/api/v1/bookings', requireAuth(store), async (req, res) => res.json({ bookings: await store.listBookings(req.user!.id) }));
  app.get('/api/v1/bookings/:id', requireAuth(store), async (req, res) => { const booking = await store.findBooking(String(req.params.id), req.user!.id); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); res.json({ booking }); });
  app.post('/api/v1/bookings/:id/cancel', requireAuth(store), async (req, res) => {
    const booking = await store.findBooking(String(req.params.id), req.user!.id); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); assert(booking.status !== 'cancelled', 409, 'BOOKING_ALREADY_CANCELLED', 'This booking is already cancelled');
    const result = await travel.cancel(booking.vertical, { bookingId: booking.id, providerRef: booking.providerRef, reason: (req.body as any)?.reason });
    const updated = await store.updateBooking(booking.id, { status: 'cancelled', response: result });
    await store.audit('booking.cancelled', { ...clientMeta(req), userId: req.user!.id, metadata: { bookingId: booking.id } });
    res.json({ booking: updated ?? booking });
  });

  app.post('/api/v1/payments/intents', requireAuth(store), async (req, res) => {
    const input = toInput(paymentRequest, req.body);
    const booking = await store.findBooking(input.bookingId, req.user!.id); assert(booking, 404, 'BOOKING_NOT_FOUND', 'Booking not found'); assert(booking.status !== 'cancelled', 409, 'BOOKING_CANCELLED', 'Cannot pay for a cancelled booking');
    const paymentRecord = await store.createPayment({ bookingId: booking.id, userId: req.user!.id, provider: 'configured', amount: input.amount, currency: input.currency.toUpperCase(), status: 'created' });
    const providerResponse: any = await payment.createIntent({ paymentId: paymentRecord.id, bookingId: booking.id, amount: input.amount, currency: input.currency.toUpperCase(), customerId: req.user!.id, returnUrl: `${config.appOrigin}/payment/return` });
    const updated = await store.updatePayment(paymentRecord.id, { status: providerResponse?.status === 'paid' ? 'paid' : 'pending', transactionRef: providerResponse?.transactionRef, providerPayload: providerResponse });
    res.status(201).json({ payment: updated ?? paymentRecord, checkoutUrl: providerResponse?.checkoutUrl });
  });
  app.post('/api/v1/payments/webhook', async (req, res) => {
    assert(payment.verifyWebhook(req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})), req.header('x-payment-signature')), 401, 'INVALID_WEBHOOK', 'Invalid payment webhook signature');
    const payload = req.body as { paymentId?: string; status?: string; transactionRef?: string; bookingId?: string };
    assert(payload.paymentId && payload.status, 400, 'INVALID_WEBHOOK', 'Payment webhook payload is incomplete');
    const status = payload.status === 'paid' ? 'paid' : payload.status === 'refunded' ? 'refunded' : payload.status === 'failed' ? 'failed' : 'pending';
    const updated = await store.updatePayment(payload.paymentId, { status, transactionRef: payload.transactionRef, providerPayload: payload });
    assert(updated, 404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    if (status === 'paid') await store.updateBooking(updated.bookingId, { status: 'confirmed' });
    res.json({ received: true });
  });

  app.post('/api/v1/support/tickets', optionalAuth(store), rateLimit('support', 20, 60), async (req, res) => {
    const input = toInput(supportRequest, req.body);
    const ticket = await store.createSupportTicket({ ...input, userId: req.user?.id });
    await store.audit('support.ticket_created', { ...clientMeta(req), userId: req.user?.id, metadata: { ticketId: ticket.id } });
    res.status(201).json({ ticket: { id: ticket.id, status: ticket.status, createdAt: ticket.createdAt } });
  });

  // Serve the cloned UI and the protected-by-API admin shell from the same origin.
  app.get('/admin', (_req, res) => res.sendFile(path.join(config.publicDir, 'admin.html')));
  app.use(express.static(config.publicDir, { index: 'index.html', maxAge: config.isProduction ? '1h' : 0 }));
  app.get(/^(?!\/api\/|\/healthz$|\/readyz$).*/, (_req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));
  app.use(notFound);
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    const normalized = error instanceof AppError ? error : error instanceof ZodError ? new AppError(400, 'VALIDATION_ERROR', 'Please check the submitted fields', error.flatten()) : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    if ((req as any).log) (req as any).log.error({ err: error, requestId: req.requestId, code: normalized.code }, normalized.message);
    res.status(normalized.statusCode).json({ error: { code: normalized.code, message: normalized.expose ? normalized.message : 'An unexpected error occurred', ...(normalized.expose && normalized.details ? { details: normalized.details } : {}) }, requestId: req.requestId });
  });
  return { app, store, connection };
}
