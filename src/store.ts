import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { decryptSecret, encryptSecret, maskSecret } from './secrets.js';

export type Channel = 'sms' | 'email';
export type User = { id: string; phone?: string; email?: string; fullName?: string; status: 'active' | 'blocked' | 'pending'; role: 'customer' | 'manager' | 'admin' | 'super_admin'; createdAt: string; updatedAt: string };
export type Tour = { id: string; slug: string; title: string; country: string; tourType: string; destinations: string[]; durationDays: number; durationNights: number; description: string; imageUrl: string; priceBdt: number; status: 'draft' | 'published' | 'archived'; featured: boolean; createdBy?: string; createdAt: string; updatedAt: string };
export type TourFilters = { q?: string; country?: string; tourType?: string; status?: Tour['status'] | 'all'; maxPrice?: number; sort?: 'newest' | 'price_asc' | 'price_desc' };
export type CreateTour = Omit<Tour, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTour = Partial<Omit<CreateTour, 'createdBy'>>;
export type OtpChallenge = { id: string; identity: string; channel: Channel; codeHash: string; attempts: number; maxAttempts: number; expiresAt: string; consumedAt?: string; requestIp?: string; createdAt: string };
export type Session = { id: string; userId: string; refreshJti: string; userAgent?: string; ip?: string; expiresAt: string; revokedAt?: string; createdAt: string };
export type BookingStatus = 'new' | 'reviewing' | 'accepted' | 'processing' | 'pending' | 'confirmed' | 'completed' | 'rejected' | 'cancelled' | 'failed';
export type Booking = { id: string; userId: string; vertical: 'flight' | 'hotel' | 'home' | 'visa' | 'esim' | 'tour'; status: BookingStatus; providerRef?: string; ownerId?: string; internalNote?: string; request: unknown; response?: unknown; createdAt: string; updatedAt: string };
export type BookingEvent = { id: string; bookingId: string; actorId?: string; action: string; fromStatus?: BookingStatus; toStatus?: BookingStatus; note?: string; createdAt: string };
export type AdminBooking = Booking & { customer?: User; owner?: User };
export type AdminBookingFilters = { q?: string; status?: BookingStatus | 'all'; vertical?: Booking['vertical'] | 'all'; ownerId?: string; page?: number; pageSize?: number };
export type Payment = { id: string; bookingId: string; userId: string; provider: string; amount: number; currency: string; status: 'created' | 'pending' | 'paid' | 'failed' | 'refunded'; transactionRef?: string; providerPayload?: unknown; createdAt: string; updatedAt: string };
export type SupportTicket = { id: string; userId?: string; name: string; mobile: string; email: string; subject: string; status: 'open' | 'pending' | 'closed'; createdAt: string; updatedAt: string };
export type Notification = { id: string; userId: string; title: string; message: string; channels: ('in_app' | 'sms' | 'email')[]; readAt?: string; createdAt: string };
export type AdminSetting = { key: string; value?: string; configured: boolean; masked?: string; secret: boolean };
export type SettingPatch = Record<string, string | undefined>;
export type ContentType = 'homepage' | 'destination' | 'hotel' | 'home' | 'visa' | 'esim' | 'offer' | 'airline' | 'banner' | 'faq' | 'company';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type ContentItem = { id: string; type: ContentType; slug: string; title: string; subtitle?: string; description?: string; imageUrl?: string; metadata: Record<string, unknown>; status: ContentStatus; sortOrder: number; createdBy?: string; createdAt: string; updatedAt: string };
export type ContentFilters = { type?: ContentType | 'all'; status?: ContentStatus | 'all'; q?: string; includeArchived?: boolean };

export type AdminStats = { bookings: { total: number; new: number; reviewing: number; accepted: number; processing: number; pending: number; confirmed: number; completed: number; rejected: number; cancelled: number; failed: number }; verticalCounts: Record<Booking['vertical'], number>; revenueBdt: number; revenueTrend: Array<{ month: string; revenueBdt: number; payments: number }>; customers: number; tours: { total: number; published: number; draft: number; archived: number }; supportTickets: { total: number; open: number; pending: number; closed: number }; statusDistribution: Array<{ status: BookingStatus; count: number }> };

type CreateUser = { identity: string; channel: Channel; fullName?: string; role?: User['role'] };
type CreateOtp = Omit<OtpChallenge, 'createdAt'>;
type CreateSession = Omit<Session, 'createdAt'>;
type CreateBooking = { userId: string; vertical: Booking['vertical']; request: unknown; status?: BookingStatus };
type CreatePayment = { bookingId: string; userId: string; provider: string; amount: number; currency: string; status?: Payment['status'] };
type CreateTicket = Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: SupportTicket['status'] };
type CreateNotification = Omit<Notification, 'id' | 'createdAt'>;
type CreateContent = Omit<ContentItem, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateContent = Partial<Omit<CreateContent, 'createdBy'>>;

type Row = Record<string, any>;
const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value ?? null);
const parse = <T>(value: unknown, fallback: T): T => { try { return value ? JSON.parse(String(value)) as T : fallback; } catch { return fallback; } };
const userFromRow = (r: Row): User => ({ id: r.id, phone: r.phone ?? undefined, email: r.email ?? undefined, fullName: r.full_name ?? undefined, status: r.status, role: r.role ?? 'customer', createdAt: r.created_at, updatedAt: r.updated_at });
const userFromAlias = (r: Row, prefix: string): User | undefined => r[`${prefix}_id`] ? ({ id: r[`${prefix}_id`], phone: r[`${prefix}_phone`] ?? undefined, email: r[`${prefix}_email`] ?? undefined, fullName: r[`${prefix}_full_name`] ?? undefined, status: r[`${prefix}_status`], role: r[`${prefix}_role`] ?? 'customer', createdAt: r[`${prefix}_created_at`], updatedAt: r[`${prefix}_updated_at`] }) : undefined;
const otpFromRow = (r: Row): OtpChallenge => ({ id: r.id, identity: r.identity, channel: r.channel, codeHash: r.code_hash, attempts: r.attempts, maxAttempts: r.max_attempts, expiresAt: r.expires_at, consumedAt: r.consumed_at ?? undefined, requestIp: r.request_ip ?? undefined, createdAt: r.created_at });
const sessionFromRow = (r: Row): Session => ({ id: r.id, userId: r.user_id, refreshJti: r.refresh_jti, userAgent: r.user_agent ?? undefined, ip: r.ip ?? undefined, expiresAt: r.expires_at, revokedAt: r.revoked_at ?? undefined, createdAt: r.created_at });
const bookingFromRow = (r: Row): Booking => ({ id: r.id, userId: r.user_id, vertical: r.vertical, status: r.status, providerRef: r.provider_ref ?? undefined, ownerId: r.owner_id ?? undefined, internalNote: r.internal_note ?? undefined, request: parse(r.request, {}), response: r.response ? parse(r.response, {}) : undefined, createdAt: r.created_at, updatedAt: r.updated_at });
const adminBookingFromRow = (r: Row): AdminBooking => ({ ...bookingFromRow(r), customer: userFromAlias(r, 'customer'), owner: userFromAlias(r, 'owner') });
const bookingEventFromRow = (r: Row): BookingEvent => ({ id: r.id, bookingId: r.booking_id, actorId: r.actor_id ?? undefined, action: r.action, fromStatus: r.from_status ?? undefined, toStatus: r.to_status ?? undefined, note: r.note ?? undefined, createdAt: r.created_at });
const paymentFromRow = (r: Row): Payment => ({ id: r.id, bookingId: r.booking_id, userId: r.user_id, provider: r.provider, amount: Number(r.amount), currency: r.currency, status: r.status, transactionRef: r.transaction_ref ?? undefined, providerPayload: r.provider_payload ? parse(r.provider_payload, {}) : undefined, createdAt: r.created_at, updatedAt: r.updated_at });
const ticketFromRow = (r: Row): SupportTicket => ({ id: r.id, userId: r.user_id ?? undefined, name: r.name, mobile: r.mobile, email: r.email, subject: r.subject, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const tourFromRow = (r: Row): Tour => ({ id: r.id, slug: r.slug, title: r.title, country: r.country, tourType: r.tour_type, destinations: parse<string[]>(r.destinations, []), durationDays: Number(r.duration_days), durationNights: Number(r.duration_nights), description: r.description ?? '', imageUrl: r.image_url ?? '', priceBdt: Number(r.price_bdt), status: r.status, featured: Boolean(r.featured), createdBy: r.created_by ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at });
const notificationFromRow = (r: Row): Notification => ({ id: r.id, userId: r.user_id, title: r.title, message: r.message, channels: parse<Notification['channels']>(r.channels, ['in_app']), readAt: r.read_at ?? undefined, createdAt: r.created_at });
const contentFromRow = (r: Row): ContentItem => ({ id: r.id, type: r.type, slug: r.slug, title: r.title, subtitle: r.subtitle ?? undefined, description: r.description ?? undefined, imageUrl: r.image_url ?? undefined, metadata: parse<Record<string, unknown>>(r.metadata, {}), status: r.status, sortOrder: Number(r.sort_order ?? 0), createdBy: r.created_by ?? undefined, createdAt: r.created_at, updatedAt: r.updated_at });

export interface Store {
  health(): Promise<boolean>; close(): void;
  findUserByIdentity(identity: string): Promise<User | undefined>; getPasswordHash(identity: string): Promise<string | undefined>; setPasswordHash(id: string, hash: string): Promise<void>; findUserById(id: string): Promise<User | undefined>; listUsers(): Promise<User[]>; createUser(input: CreateUser): Promise<User>; setUserRole(id: string, role: User['role']): Promise<User | undefined>;
  createOtp(input: CreateOtp): Promise<OtpChallenge>; findOtp(id: string): Promise<OtpChallenge | undefined>; incrementOtpAttempts(id: string): Promise<OtpChallenge | undefined>; consumeOtp(id: string): Promise<void>; countRecentOtpRequests(identity: string, since: Date): Promise<number>;
  createSession(input: CreateSession): Promise<Session>; findSessionById(id: string): Promise<Session | undefined>; findSessionByRefreshJti(jti: string): Promise<Session | undefined>; revokeSession(id: string): Promise<void>;
  createBooking(input: CreateBooking): Promise<Booking>; updateBooking(id: string, patch: Partial<Pick<Booking, 'status' | 'providerRef' | 'response' | 'internalNote'>>): Promise<Booking | undefined>; findBooking(id: string, userId?: string): Promise<Booking | undefined>; findBookingForTracking(id: string, identity: string): Promise<Booking | undefined>; listBookings(userId: string): Promise<Booking[]>;
  listAdminBookings(filters?: AdminBookingFilters): Promise<{ bookings: AdminBooking[]; total: number; page: number; pageSize: number; pageCount: number }>;
  claimBooking(id: string, userId: string): Promise<AdminBooking | undefined>; releaseBooking(id: string, userId: string, canReleaseAny?: boolean): Promise<AdminBooking | undefined>; updateAdminBooking(id: string, patch: { status?: BookingStatus; internalNote?: string; ownerId?: string | null; request?: unknown }, actorId: string, action?: string): Promise<AdminBooking | undefined>; listBookingEvents(id: string): Promise<BookingEvent[]>; addBookingEvent(input: { bookingId: string; actorId?: string; action: string; fromStatus?: BookingStatus; toStatus?: BookingStatus; note?: string }): Promise<BookingEvent>;
  listTours(filters?: TourFilters): Promise<Tour[]>; findTour(idOrSlug: string): Promise<Tour | undefined>; createTour(input: CreateTour): Promise<Tour>; updateTour(id: string, patch: UpdateTour): Promise<Tour | undefined>; archiveTour(id: string): Promise<Tour | undefined>; tourStats(): Promise<{ total: number; published: number; draft: number; archived: number }>;
  createPayment(input: CreatePayment): Promise<Payment>; updatePayment(id: string, patch: Partial<Pick<Payment, 'status' | 'transactionRef' | 'providerPayload'>>): Promise<Payment | undefined>;
  createSupportTicket(input: CreateTicket): Promise<SupportTicket>; listSupportTickets(filters?: { status?: SupportTicket['status'] | 'all'; q?: string }): Promise<SupportTicket[]>; updateSupportTicket(id: string, patch: { status?: SupportTicket['status'] }): Promise<SupportTicket | undefined>;
  getSetting(key: string): Promise<string | undefined>; getAdminSettings(): Promise<AdminSetting[]>; updateSettings(patch: SettingPatch, updatedBy: string): Promise<void>; createNotification(input: CreateNotification): Promise<Notification>; listNotifications(userId: string): Promise<Notification[]>; markNotificationRead(id: string, userId: string): Promise<Notification | undefined>;
  listContent(filters?: ContentFilters): Promise<ContentItem[]>; findContent(id: string): Promise<ContentItem | undefined>; createContent(input: CreateContent): Promise<ContentItem>; updateContent(id: string, patch: UpdateContent): Promise<ContentItem | undefined>; archiveContent(id: string): Promise<ContentItem | undefined>;
  adminStats(): Promise<AdminStats>; listAuditLogs(limit?: number): Promise<Array<{ id: number; action: string; userId?: string; metadata: unknown; createdAt: string }>>;
  audit(action: string, input: { userId?: string; ip?: string; userAgent?: string; metadata?: unknown }): Promise<void>;
}

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT UNIQUE, email TEXT UNIQUE, full_name TEXT, status TEXT NOT NULL DEFAULT 'active', role TEXT NOT NULL DEFAULT 'customer', password_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS otp_challenges (id TEXT PRIMARY KEY, identity TEXT NOT NULL, channel TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, expires_at TEXT NOT NULL, consumed_at TEXT, request_ip TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS otp_identity_created_idx ON otp_challenges(identity, created_at);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, refresh_jti TEXT UNIQUE NOT NULL, user_agent TEXT, ip TEXT, expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, created_at);
CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, vertical TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', provider_ref TEXT, request TEXT NOT NULL, response TEXT, owner_id TEXT, internal_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id, created_at);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status, updated_at);
CREATE TABLE IF NOT EXISTS booking_events (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL, from_status TEXT, to_status TEXT, note TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON booking_events(booking_id, created_at);
CREATE TABLE IF NOT EXISTS tours (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, country TEXT NOT NULL, tour_type TEXT NOT NULL, destinations TEXT NOT NULL, duration_days INTEGER NOT NULL, duration_nights INTEGER NOT NULL, description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '', price_bdt REAL NOT NULL, status TEXT NOT NULL DEFAULT 'draft', featured INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tours_filter_idx ON tours(status, country, tour_type, price_bdt);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, user_id TEXT NOT NULL, provider TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'created', transaction_ref TEXT, provider_payload TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, channels TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT NOT NULL, ip TEXT, user_agent TEXT, metadata TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, is_secret INTEGER NOT NULL DEFAULT 0, updated_by TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_items (id TEXT PRIMARY KEY, type TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, description TEXT, image_url TEXT, metadata TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft', sort_order INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(type, slug));
CREATE INDEX IF NOT EXISTS content_filter_idx ON content_items(type, status, sort_order, updated_at);
`;

const SECRET_SETTING_KEYS = new Set(['payment_webhook_secret','sslcommerz_store_password', 'sslcommerz_api_key', 'bkash_app_key', 'bkash_app_secret', 'bkash_username', 'bkash_password', 'bkash_token', 'sms_api_key', 'sms_gateway_username', 'sms_gateway_password', 'smtp_password', 'travel_provider_api_key', 'payment_provider_api_key']);

export class SQLiteStore implements Store {
  private db: Database.Database;
  constructor() {
    fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
    this.db = new Database(config.sqlitePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(schema);
    // Safe additive migrations for databases created by earlier Sadik Travels builds.
    for (const statement of ['ALTER TABLE users ADD COLUMN password_hash TEXT', 'ALTER TABLE bookings ADD COLUMN owner_id TEXT', 'ALTER TABLE bookings ADD COLUMN internal_note TEXT']) {
      try { this.db.exec(statement); } catch { /* Column already exists. */ }
    }
  }
  async health() { this.db.prepare('SELECT 1').get(); return true; }
  close() { if (this.db.open) this.db.close(); }
  async findUserByIdentity(identity: string) { const r = this.db.prepare('SELECT * FROM users WHERE phone = ? OR email = ? LIMIT 1').get(identity, identity) as Row | undefined; return r ? userFromRow(r) : undefined; }
  async getPasswordHash(identity: string) { const r = this.db.prepare('SELECT password_hash FROM users WHERE phone=? OR email=? LIMIT 1').get(identity, identity) as Row | undefined; return r?.password_hash ?? undefined; }
  async setPasswordHash(id: string, hash: string) { this.db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(hash, now(), id); }
  async findUserById(id: string) { const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined; return r ? userFromRow(r) : undefined; }
  async listUsers() { return (this.db.prepare("SELECT * FROM users WHERE status='active' ORDER BY created_at DESC").all() as Row[]).map(userFromRow); }
  async createUser(input: CreateUser) { const time = now(); const user: User = { id: randomUUID(), phone: input.channel === 'sms' ? input.identity : undefined, email: input.channel === 'email' ? input.identity : undefined, fullName: input.fullName, status: 'active', role: input.role ?? 'customer', createdAt: time, updatedAt: time }; this.db.prepare('INSERT INTO users(id,phone,email,full_name,status,role,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(user.id, user.phone ?? null, user.email ?? null, user.fullName ?? null, user.status, user.role, null, time, time); return user; }
  async setUserRole(id: string, role: User['role']) { this.db.prepare('UPDATE users SET role=?,updated_at=? WHERE id=?').run(role, now(), id); return this.findUserById(id); }

  async createOtp(input: CreateOtp) { const item = { ...input, createdAt: now() }; this.db.prepare('INSERT INTO otp_challenges(id,identity,channel,code_hash,attempts,max_attempts,expires_at,consumed_at,request_ip,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(item.id,item.identity,item.channel,item.codeHash,item.attempts,item.maxAttempts,item.expiresAt,item.consumedAt ?? null,item.requestIp ?? null,item.createdAt); return item; }
  async findOtp(id: string) { const r = this.db.prepare('SELECT * FROM otp_challenges WHERE id=?').get(id) as Row | undefined; return r ? otpFromRow(r) : undefined; }
  async incrementOtpAttempts(id: string) { this.db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?').run(id); return this.findOtp(id); }
  async consumeOtp(id: string) { this.db.prepare('UPDATE otp_challenges SET consumed_at=? WHERE id=?').run(now(), id); }
  async countRecentOtpRequests(identity: string, since: Date) { return Number((this.db.prepare('SELECT COUNT(*) AS count FROM otp_challenges WHERE identity=? AND created_at>=?').get(identity, since.toISOString()) as Row).count); }

  async createSession(input: CreateSession) { const item = { ...input, createdAt: now() }; this.db.prepare('INSERT INTO sessions(id,user_id,refresh_jti,user_agent,ip,expires_at,revoked_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run(item.id,item.userId,item.refreshJti,item.userAgent ?? null,item.ip ?? null,item.expiresAt,item.revokedAt ?? null,item.createdAt); return item; }
  async findSessionById(id: string) { const r = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Row | undefined; return r ? sessionFromRow(r) : undefined; }
  async findSessionByRefreshJti(jti: string) { const r = this.db.prepare('SELECT * FROM sessions WHERE refresh_jti=?').get(jti) as Row | undefined; return r ? sessionFromRow(r) : undefined; }
  async revokeSession(id: string) { this.db.prepare('UPDATE sessions SET revoked_at=? WHERE id=?').run(now(), id); }

  async createBooking(input: CreateBooking) {
    const time = now();
    const item: Booking = { id: randomUUID(), userId: input.userId, vertical: input.vertical, status: input.status ?? 'pending', request: input.request, createdAt: time, updatedAt: time };
    this.db.prepare('INSERT INTO bookings(id,user_id,vertical,status,provider_ref,request,response,owner_id,internal_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.userId,item.vertical,item.status,null,json(item.request),null,null,null,time,time);
    await this.addBookingEvent({ bookingId: item.id, actorId: item.userId, action: 'created', toStatus: item.status });
    return item;
  }
  async updateBooking(id: string, patch: Partial<Pick<Booking, 'status' | 'providerRef' | 'response' | 'internalNote'>>) {
    const item = await this.findBooking(id); if (!item) return undefined;
    const updated = { ...item, ...patch, updatedAt: now() };
    this.db.prepare('UPDATE bookings SET status=?,provider_ref=?,request=?,response=?,owner_id=?,internal_note=?,updated_at=? WHERE id=?').run(updated.status,updated.providerRef ?? null,json(updated.request),updated.response === undefined ? null : json(updated.response),updated.ownerId ?? null,updated.internalNote ?? null,updated.updatedAt,id);
    if (item.status !== updated.status || item.providerRef !== updated.providerRef) await this.addBookingEvent({ bookingId: id, action: 'provider_updated', fromStatus: item.status, toStatus: updated.status, note: updated.providerRef ? `Provider reference ${updated.providerRef}` : undefined });
    return updated;
  }
  async findBooking(id: string, userId?: string) { const r = this.db.prepare(`SELECT * FROM bookings WHERE id=? ${userId ? 'AND user_id=?' : ''}`).get(...(userId ? [id,userId] : [id])) as Row | undefined; return r ? bookingFromRow(r) : undefined; }
  async findBookingForTracking(id: string, identity: string) { const r = this.db.prepare('SELECT b.* FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.id=? AND (u.phone=? OR u.email=?) LIMIT 1').get(id, identity, identity) as Row | undefined; return r ? bookingFromRow(r) : undefined; }
  async listBookings(userId: string) { return (this.db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY created_at DESC').all(userId) as Row[]).map(bookingFromRow); }

  async listAdminBookings(filters: AdminBookingFilters = {}) {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(filters.pageSize || 20)));
    const where: string[] = [];
    const params: any[] = [];
    if (filters.status && filters.status !== 'all') { where.push('b.status=?'); params.push(filters.status); }
    if (filters.vertical && filters.vertical !== 'all') { where.push('b.vertical=?'); params.push(filters.vertical); }
    if (filters.ownerId) { where.push('b.owner_id=?'); params.push(filters.ownerId); }
    if (filters.q) { const q = `%${filters.q.toLowerCase()}%`; where.push('(LOWER(b.id) LIKE ? OR LOWER(b.vertical) LIKE ? OR LOWER(COALESCE(b.provider_ref,\'\')) LIKE ? OR LOWER(COALESCE(c.phone,\'\')) LIKE ? OR LOWER(COALESCE(c.email,\'\')) LIKE ? OR LOWER(COALESCE(c.full_name,\'\')) LIKE ?)'); params.push(q,q,q,q,q,q); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM bookings b LEFT JOIN users c ON c.id=b.user_id ${clause}`).get(...params) as Row).count);
    const rows = this.db.prepare(`SELECT b.*, c.id AS customer_id, c.phone AS customer_phone, c.email AS customer_email, c.full_name AS customer_full_name, c.status AS customer_status, c.role AS customer_role, c.created_at AS customer_created_at, c.updated_at AS customer_updated_at, o.id AS owner_id_alias, o.phone AS owner_phone, o.email AS owner_email, o.full_name AS owner_full_name, o.status AS owner_status, o.role AS owner_role, o.created_at AS owner_created_at, o.updated_at AS owner_updated_at FROM bookings b LEFT JOIN users c ON c.id=b.user_id LEFT JOIN users o ON o.id=b.owner_id ${clause} ORDER BY b.updated_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as Row[];
    return { bookings: rows.map(row => adminBookingFromRow({ ...row, owner_id: row.owner_id_alias })), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
  }
  async claimBooking(id: string, userId: string) {
    const changed = this.db.prepare('UPDATE bookings SET owner_id=?,updated_at=? WHERE id=? AND (owner_id IS NULL OR owner_id=?)').run(userId, now(), id, userId);
    if (!changed.changes) return undefined;
    await this.addBookingEvent({ bookingId: id, actorId: userId, action: 'claimed', note: 'Booking assigned to operator' });
    const row = this.db.prepare('SELECT b.*, c.id AS customer_id, c.phone AS customer_phone, c.email AS customer_email, c.full_name AS customer_full_name, c.status AS customer_status, c.role AS customer_role, c.created_at AS customer_created_at, c.updated_at AS customer_updated_at, o.id AS owner_id_alias, o.phone AS owner_phone, o.email AS owner_email, o.full_name AS owner_full_name, o.status AS owner_status, o.role AS owner_role, o.created_at AS owner_created_at, o.updated_at AS owner_updated_at FROM bookings b LEFT JOIN users c ON c.id=b.user_id LEFT JOIN users o ON o.id=b.owner_id WHERE b.id=?').get(id) as Row | undefined;
    return row ? adminBookingFromRow({ ...row, owner_id: row.owner_id_alias }) : undefined;
  }
  async releaseBooking(id: string, userId: string, canReleaseAny = false) {
    const changed = this.db.prepare(`UPDATE bookings SET owner_id=NULL,updated_at=? WHERE id=? ${canReleaseAny ? '' : 'AND owner_id=?'}`).run(...(canReleaseAny ? [now(), id] : [now(), id, userId]));
    if (!changed.changes) return undefined;
    await this.addBookingEvent({ bookingId: id, actorId: userId, action: 'released', note: 'Booking released from operator' });
    const row = this.db.prepare('SELECT b.*, c.id AS customer_id, c.phone AS customer_phone, c.email AS customer_email, c.full_name AS customer_full_name, c.status AS customer_status, c.role AS customer_role, c.created_at AS customer_created_at, c.updated_at AS customer_updated_at FROM bookings b LEFT JOIN users c ON c.id=b.user_id WHERE b.id=?').get(id) as Row | undefined;
    return row ? adminBookingFromRow(row) : undefined;
  }
  async updateAdminBooking(id: string, patch: { status?: BookingStatus; internalNote?: string; ownerId?: string | null; request?: unknown }, actorId: string, action = 'updated') {
    const current = await this.findBooking(id); if (!current) return undefined;
    const updated = { ...current, ...(patch.status === undefined ? {} : { status: patch.status }), ...(patch.internalNote === undefined ? {} : { internalNote: patch.internalNote }), ...(patch.ownerId === undefined ? {} : { ownerId: patch.ownerId ?? undefined }), ...(patch.request === undefined ? {} : { request: patch.request }), updatedAt: now() };
    this.db.prepare('UPDATE bookings SET status=?,provider_ref=?,request=?,response=?,owner_id=?,internal_note=?,updated_at=? WHERE id=?').run(updated.status,updated.providerRef ?? null,json(updated.request),updated.response === undefined ? null : json(updated.response),updated.ownerId ?? null,updated.internalNote ?? null,updated.updatedAt,id);
    if (current.status !== updated.status || current.internalNote !== updated.internalNote || current.ownerId !== updated.ownerId || JSON.stringify(current.request) !== JSON.stringify(updated.request)) await this.addBookingEvent({ bookingId: id, actorId, action, fromStatus: current.status, toStatus: updated.status, note: updated.internalNote });
    const result = await this.listAdminBookings({ q: id, page: 1, pageSize: 1 });
    return result.bookings[0];
  }
  async listBookingEvents(id: string) { return (this.db.prepare('SELECT * FROM booking_events WHERE booking_id=? ORDER BY created_at ASC').all(id) as Row[]).map(bookingEventFromRow); }
  async addBookingEvent(input: { bookingId: string; actorId?: string; action: string; fromStatus?: BookingStatus; toStatus?: BookingStatus; note?: string }) { const item: BookingEvent = { id: randomUUID(), bookingId: input.bookingId, actorId: input.actorId, action: input.action, fromStatus: input.fromStatus, toStatus: input.toStatus, note: input.note, createdAt: now() }; this.db.prepare('INSERT INTO booking_events(id,booking_id,actor_id,action,from_status,to_status,note,created_at) VALUES(?,?,?,?,?,?,?,?)').run(item.id,item.bookingId,item.actorId ?? null,item.action,item.fromStatus ?? null,item.toStatus ?? null,item.note ?? null,item.createdAt); return item; }

  async listTours(filters: TourFilters = {}) { const where: string[] = []; const params: any[] = []; if (filters.status && filters.status !== 'all') { where.push('status=?'); params.push(filters.status); } else if (!filters.status) { where.push("status='published'"); } if (filters.q) { where.push('(LOWER(title) LIKE ? OR LOWER(country) LIKE ? OR LOWER(tour_type) LIKE ? OR LOWER(destinations) LIKE ?)'); const q=`%${filters.q.toLowerCase()}%`; params.push(q,q,q,q); } if (filters.country) { where.push('LOWER(country)=?'); params.push(filters.country.toLowerCase()); } if (filters.tourType) { where.push('LOWER(tour_type)=?'); params.push(filters.tourType.toLowerCase()); } if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) { where.push('price_bdt<=?'); params.push(filters.maxPrice); } const order=filters.sort==='price_asc'?'price_bdt ASC':filters.sort==='price_desc'?'price_bdt DESC':'created_at DESC'; const sql=`SELECT * FROM tours ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ${order}`; return (this.db.prepare(sql).all(...params) as Row[]).map(tourFromRow); }
  async findTour(idOrSlug: string) { const r=this.db.prepare('SELECT * FROM tours WHERE id=? OR slug=? LIMIT 1').get(idOrSlug,idOrSlug) as Row | undefined; return r ? tourFromRow(r) : undefined; }
  async createTour(input: CreateTour) { const time=now(); const item:Tour={id:randomUUID(),...input,createdAt:time,updatedAt:time}; this.db.prepare('INSERT INTO tours(id,slug,title,country,tour_type,destinations,duration_days,duration_nights,description,image_url,price_bdt,status,featured,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.slug,item.title,item.country,item.tourType,json(item.destinations),item.durationDays,item.durationNights,item.description,item.imageUrl,item.priceBdt,item.status,item.featured?1:0,item.createdBy??null,time,time); return item; }
  async updateTour(id: string, patch: UpdateTour) { const item=await this.findTour(id); if(!item)return undefined; const updated={...item,...patch,updatedAt:now()}; this.db.prepare('UPDATE tours SET slug=?,title=?,country=?,tour_type=?,destinations=?,duration_days=?,duration_nights=?,description=?,image_url=?,price_bdt=?,status=?,featured=?,updated_at=? WHERE id=?').run(updated.slug,updated.title,updated.country,json(updated.destinations),updated.durationDays,updated.durationNights,updated.description,updated.imageUrl,updated.priceBdt,updated.status,updated.featured?1:0,updated.updatedAt,id); return updated; }
  async archiveTour(id: string) { return this.updateTour(id,{status:'archived'}); }
  async tourStats() { const rows=this.db.prepare('SELECT status,COUNT(*) AS count FROM tours GROUP BY status').all() as Row[]; const stats={total:0,published:0,draft:0,archived:0}; rows.forEach(r=>{if (r.status in stats) stats[r.status as keyof typeof stats]=Number(r.count);stats.total+=Number(r.count);}); return stats; }

  async createPayment(input: CreatePayment) { const time=now(); const item:Payment={id:randomUUID(),...input,status:input.status??'created',createdAt:time,updatedAt:time}; this.db.prepare('INSERT INTO payments(id,booking_id,user_id,provider,amount,currency,status,transaction_ref,provider_payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.bookingId,item.userId,item.provider,item.amount,item.currency,item.status,null,null,time,time); return item; }
  async updatePayment(id: string, patch: Partial<Pick<Payment,'status'|'transactionRef'|'providerPayload'>>) { const r=this.db.prepare('SELECT * FROM payments WHERE id=?').get(id) as Row|undefined;if(!r)return undefined;const item={...paymentFromRow(r),...patch,updatedAt:now()};this.db.prepare('UPDATE payments SET status=?,transaction_ref=?,provider_payload=?,updated_at=? WHERE id=?').run(item.status,item.transactionRef??null,item.providerPayload===undefined?null:json(item.providerPayload),item.updatedAt,id);return item; }

  async createSupportTicket(input: CreateTicket) { const time=now();const item:SupportTicket={id:randomUUID(),...input,status:input.status??'open',createdAt:time,updatedAt:time};this.db.prepare('INSERT INTO support_tickets(id,user_id,name,mobile,email,subject,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(item.id,item.userId??null,item.name,item.mobile,item.email,item.subject,item.status,time,time);return item; }
  async listSupportTickets(filters: { status?: SupportTicket['status'] | 'all'; q?: string } = {}) { const where: string[] = []; const params: any[] = []; if (filters.status && filters.status !== 'all') { where.push('status=?'); params.push(filters.status); } if (filters.q) { const q=`%${filters.q.toLowerCase()}%`; where.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(mobile) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(id) LIKE ?)'); params.push(q,q,q,q,q); } const rows=this.db.prepare(`SELECT * FROM support_tickets ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`).all(...params) as Row[]; return rows.map(ticketFromRow); }
  async updateSupportTicket(id: string, patch: { status?: SupportTicket['status'] }) { const current=this.db.prepare('SELECT * FROM support_tickets WHERE id=?').get(id) as Row|undefined; if(!current)return undefined; const status=patch.status ?? current.status; this.db.prepare('UPDATE support_tickets SET status=?,updated_at=? WHERE id=?').run(status,now(),id); const row=this.db.prepare('SELECT * FROM support_tickets WHERE id=?').get(id) as Row; return ticketFromRow(row); }

  async createNotification(input: CreateNotification) { const item:Notification={id:randomUUID(),...input,createdAt:now()}; this.db.prepare('INSERT INTO notifications(id,user_id,title,message,channels,read_at,created_at) VALUES(?,?,?,?,?,?,?)').run(item.id,item.userId,item.title,item.message,json(item.channels),null,item.createdAt);return item; }
  async listNotifications(userId: string) { return (this.db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId) as Row[]).map(notificationFromRow); }
  async markNotificationRead(id: string,userId: string) { this.db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(now(),id,userId);const r=this.db.prepare('SELECT * FROM notifications WHERE id=? AND user_id=?').get(id,userId) as Row|undefined;return r?notificationFromRow(r):undefined; }

  async getSetting(key: string) { const row = this.db.prepare('SELECT value,is_secret FROM settings WHERE key=?').get(key) as Row | undefined; if (!row?.value) return undefined; return row.is_secret ? decryptSecret(row.value) : String(row.value); }
  async getAdminSettings() { const rows = this.db.prepare('SELECT key,value,is_secret FROM settings ORDER BY key').all() as Row[]; return rows.map(row => ({ key: row.key, configured: Boolean(row.value), secret: Boolean(row.is_secret), ...(row.is_secret ? { masked: maskSecret(row.value) } : { value: row.value ?? '' }) })); }
  async updateSettings(patch: SettingPatch, updatedBy: string) { const statement = this.db.prepare('INSERT INTO settings(key,value,is_secret,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,is_secret=excluded.is_secret,updated_by=excluded.updated_by,updated_at=excluded.updated_at'); const transaction = this.db.transaction((entries: [string, string | undefined][]) => { for (const [key, raw] of entries) { if (raw === undefined) continue; const secret = SECRET_SETTING_KEYS.has(key); statement.run(key, secret ? encryptSecret(raw) : raw, secret ? 1 : 0, updatedBy, now()); } }); transaction(Object.entries(patch)); }

  async listContent(filters: ContentFilters = {}) { const where: string[] = []; const params: any[] = []; if (filters.type && filters.type !== 'all') { where.push('type=?'); params.push(filters.type); } if (filters.status && filters.status !== 'all') { where.push('status=?'); params.push(filters.status); } else if (!filters.includeArchived && !filters.status) { where.push("status='published'"); } if (filters.q) { const q=`%${filters.q.toLowerCase()}%`; where.push('(LOWER(title) LIKE ? OR LOWER(slug) LIKE ? OR LOWER(COALESCE(description,\'\')) LIKE ?)'); params.push(q,q,q); } const rows=this.db.prepare(`SELECT * FROM content_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY sort_order ASC, updated_at DESC`).all(...params) as Row[]; return rows.map(contentFromRow); }
  async findContent(id: string) { const r=this.db.prepare('SELECT * FROM content_items WHERE id=?').get(id) as Row|undefined; return r ? contentFromRow(r) : undefined; }
  async createContent(input: CreateContent) { const time=now(); const item:ContentItem={id:randomUUID(),...input,metadata:input.metadata ?? {},createdAt:time,updatedAt:time}; this.db.prepare('INSERT INTO content_items(id,type,slug,title,subtitle,description,image_url,metadata,status,sort_order,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id,item.type,item.slug,item.title,item.subtitle??null,item.description??null,item.imageUrl??null,json(item.metadata),item.status,item.sortOrder,item.createdBy??null,time,time); return item; }
  async updateContent(id: string, patch: UpdateContent) { const item=await this.findContent(id); if(!item)return undefined; const updated={...item,...patch,metadata:patch.metadata ?? item.metadata,updatedAt:now()}; this.db.prepare('UPDATE content_items SET type=?,slug=?,title=?,subtitle=?,description=?,image_url=?,metadata=?,status=?,sort_order=?,updated_at=? WHERE id=?').run(updated.type,updated.slug,updated.title,updated.subtitle??null,updated.description??null,updated.imageUrl??null,json(updated.metadata),updated.status,updated.sortOrder,updated.updatedAt,id); return updated; }
  async archiveContent(id: string) { return this.updateContent(id,{status:'archived'}); }

  async adminStats(): Promise<AdminStats> {
    const statusRows = this.db.prepare('SELECT status, COUNT(*) AS count FROM bookings GROUP BY status').all() as Row[];
    const statuses: BookingStatus[] = ['new','reviewing','accepted','processing','pending','confirmed','completed','rejected','cancelled','failed'];
    const counts = Object.fromEntries(statuses.map(status => [status, 0])) as Record<BookingStatus, number>;
    for (const row of statusRows) if (row.status in counts) counts[row.status as BookingStatus] = Number(row.count);
    const tourRows = await this.tourStats();
    const ticketRows = this.db.prepare('SELECT status, COUNT(*) AS count FROM support_tickets GROUP BY status').all() as Row[];
    const ticketCounts = { total: 0, open: 0, pending: 0, closed: 0 };
    for (const row of ticketRows) { if (row.status in ticketCounts) ticketCounts[row.status as keyof typeof ticketCounts] = Number(row.count); ticketCounts.total += Number(row.count); }
    const revenue = Number((this.db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM payments WHERE status='paid' AND currency='BDT'").get() as Row).amount);
    const customers = Number((this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='customer' AND status='active'").get() as Row).count);
    const revenueTrend = (this.db.prepare("SELECT substr(created_at,1,7) AS month, COALESCE(SUM(CASE WHEN status='paid' AND currency='BDT' THEN amount ELSE 0 END),0) AS revenue, COUNT(*) AS payments FROM payments WHERE created_at >= datetime('now','-6 months') GROUP BY substr(created_at,1,7) ORDER BY month ASC").all() as Row[]).map(row => ({ month: String(row.month), revenueBdt: Number(row.revenue), payments: Number(row.payments) }));
    const verticals: Booking['vertical'][] = ['flight', 'hotel', 'home', 'visa', 'esim', 'tour'];
    const verticalCounts = Object.fromEntries(verticals.map(vertical => [vertical, 0])) as Record<Booking['vertical'], number>;
    for (const row of this.db.prepare('SELECT vertical, COUNT(*) AS count FROM bookings GROUP BY vertical').all() as Row[]) if (row.vertical in verticalCounts) verticalCounts[row.vertical as Booking['vertical']] = Number(row.count);
    return { bookings: { total: Object.values(counts).reduce((sum, value) => sum + value, 0), ...counts }, verticalCounts, revenueBdt: revenue, revenueTrend, customers, tours: tourRows, supportTickets: ticketCounts, statusDistribution: statuses.map(status => ({ status, count: counts[status] })).filter(item => item.count > 0) };
  }
  async listAuditLogs(limit = 30) { const rows=this.db.prepare('SELECT id,user_id,action,metadata,created_at FROM audit_logs ORDER BY id DESC LIMIT ?').all(Math.min(100,Math.max(1,limit))) as Row[]; return rows.map(row => ({ id:Number(row.id), action:row.action, userId:row.user_id ?? undefined, metadata:parse(row.metadata,{}), createdAt:row.created_at })); }
  async audit(action: string,input:{userId?:string;ip?:string;userAgent?:string;metadata?:unknown}) { this.db.prepare('INSERT INTO audit_logs(user_id,action,ip,user_agent,metadata,created_at) VALUES(?,?,?,?,?,?)').run(input.userId??null,action,input.ip??null,input.userAgent??null,json(input.metadata),now()); }
}

export function createStore(): { store: Store } { return { store: new SQLiteStore() }; }
