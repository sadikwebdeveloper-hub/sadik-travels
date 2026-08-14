import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
type Model<T = any> = mongoose.Model<T>;
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

export type Channel = 'sms' | 'email';
export type User = { id: string; phone?: string; email?: string; fullName?: string; status: 'active' | 'blocked' | 'pending'; role: 'customer' | 'manager' | 'admin'; createdAt: string; updatedAt: string };
export type Tour = { id: string; slug: string; title: string; country: string; tourType: string; destinations: string[]; durationDays: number; durationNights: number; description: string; imageUrl: string; priceBdt: number; status: 'draft' | 'published' | 'archived'; featured: boolean; createdBy?: string; createdAt: string; updatedAt: string };
export type TourFilters = { q?: string; country?: string; tourType?: string; status?: Tour['status']; maxPrice?: number; sort?: 'newest' | 'price_asc' | 'price_desc' };
export type CreateTour = Omit<Tour, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateTour = Partial<Omit<CreateTour, 'createdBy'>>;
export type OtpChallenge = { id: string; identity: string; channel: Channel; codeHash: string; attempts: number; maxAttempts: number; expiresAt: string; consumedAt?: string; requestIp?: string; createdAt: string };
export type Session = { id: string; userId: string; refreshJti: string; userAgent?: string; ip?: string; expiresAt: string; revokedAt?: string; createdAt: string };
export type Booking = { id: string; userId: string; vertical: 'flight' | 'hotel' | 'home' | 'visa' | 'esim' | 'tour'; status: 'pending' | 'confirmed' | 'cancelled' | 'failed'; providerRef?: string; request: unknown; response?: unknown; createdAt: string; updatedAt: string };
export type Payment = { id: string; bookingId: string; userId: string; provider: string; amount: number; currency: string; status: 'created' | 'pending' | 'paid' | 'failed' | 'refunded'; transactionRef?: string; providerPayload?: unknown; createdAt: string; updatedAt: string };
export type SupportTicket = { id: string; userId?: string; name: string; mobile: string; email: string; subject: string; status: 'open' | 'pending' | 'closed'; createdAt: string; updatedAt: string };

type CreateUser = { identity: string; channel: Channel; fullName?: string; role?: User['role'] };
type CreateOtp = Omit<OtpChallenge, 'createdAt'>;
type CreateSession = Omit<Session, 'createdAt'>;
type CreateBooking = { userId: string; vertical: Booking['vertical']; request: unknown; status?: Booking['status'] };
type CreatePayment = { bookingId: string; userId: string; provider: string; amount: number; currency: string; status?: Payment['status'] };
type CreateTicket = Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: SupportTicket['status'] };

const now = () => new Date().toISOString();
const toIso = (value: Date | string | undefined | null) => value ? new Date(value).toISOString() : undefined;

const baseOptions = { timestamps: true, versionKey: false as const };
const userSchema = new Schema({ id: { type: String, unique: true, index: true }, phone: { type: String, unique: true, sparse: true, index: true }, email: { type: String, unique: true, sparse: true, lowercase: true, index: true }, fullName: String, status: { type: String, enum: ['active', 'blocked', 'pending'], default: 'active' }, role: { type: String, enum: ['customer', 'manager', 'admin'], default: 'customer', index: true } }, baseOptions);
const otpSchema = new Schema({ id: { type: String, unique: true, index: true }, identity: { type: String, index: true }, channel: { type: String, enum: ['sms', 'email'] }, codeHash: String, attempts: { type: Number, default: 0 }, maxAttempts: { type: Number, default: 5 }, expiresAt: { type: Date, index: { expires: 0 } }, consumedAt: Date, requestIp: String }, { ...baseOptions, timestamps: { createdAt: true, updatedAt: false } });
const sessionSchema = new Schema({ id: { type: String, unique: true, index: true }, userId: { type: String, index: true }, refreshJti: { type: String, unique: true, index: true }, userAgent: String, ip: String, expiresAt: { type: Date, index: true }, revokedAt: Date }, baseOptions);
const bookingSchema = new Schema({ id: { type: String, unique: true, index: true }, userId: { type: String, index: true }, vertical: { type: String, enum: ['flight', 'hotel', 'home', 'visa', 'esim', 'tour'] }, status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'failed'], default: 'pending', index: true }, providerRef: String, request: Schema.Types.Mixed, response: Schema.Types.Mixed }, baseOptions);
const paymentSchema = new Schema({ id: { type: String, unique: true, index: true }, bookingId: { type: String, index: true }, userId: { type: String, index: true }, provider: String, amount: Number, currency: String, status: { type: String, enum: ['created', 'pending', 'paid', 'failed', 'refunded'], default: 'created', index: true }, transactionRef: String, providerPayload: Schema.Types.Mixed }, baseOptions);
const supportTicketSchema = new Schema({ id: { type: String, unique: true, index: true }, userId: String, name: String, mobile: String, email: String, subject: String, status: { type: String, enum: ['open', 'pending', 'closed'], default: 'open', index: true } }, baseOptions);
const tourSchema = new Schema({ id: { type: String, unique: true, index: true }, slug: { type: String, unique: true, index: true }, title: String, country: { type: String, index: true }, tourType: { type: String, index: true }, destinations: { type: [String], default: [] }, durationDays: Number, durationNights: Number, description: String, imageUrl: String, priceBdt: { type: Number, index: true }, status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true }, featured: Boolean, createdBy: String }, baseOptions);
const auditSchema = new Schema({ userId: String, action: String, ip: String, userAgent: String, metadata: Schema.Types.Mixed }, { ...baseOptions, timestamps: { createdAt: true, updatedAt: false } });

export const UserModel = (models.AmyUser as Model<any>) || model('AmyUser', userSchema);
export const OtpModel = (models.AmyOtp as Model<any>) || model('AmyOtp', otpSchema);
export const SessionModel = (models.AmySession as Model<any>) || model('AmySession', sessionSchema);
export const BookingModel = (models.AmyBooking as Model<any>) || model('AmyBooking', bookingSchema);
export const PaymentModel = (models.AmyPayment as Model<any>) || model('AmyPayment', paymentSchema);
export const SupportTicketModel = (models.AmySupportTicket as Model<any>) || model('AmySupportTicket', supportTicketSchema);
export const TourModel = (models.AmyTour as Model<any>) || model('AmyTour', tourSchema);
export const AuditModel = (models.AmyAudit as Model<any>) || model('AmyAudit', auditSchema);

const userFromDoc = (doc: any): User => ({ id: doc.id, phone: doc.phone ?? undefined, email: doc.email ?? undefined, fullName: doc.fullName ?? undefined, status: doc.status, role: doc.role ?? 'customer', createdAt: new Date(doc.createdAt).toISOString(), updatedAt: new Date(doc.updatedAt).toISOString() });
const otpFromDoc = (doc: any): OtpChallenge => ({ id: doc.id, identity: doc.identity, channel: doc.channel, codeHash: doc.codeHash, attempts: doc.attempts, maxAttempts: doc.maxAttempts, expiresAt: new Date(doc.expiresAt).toISOString(), consumedAt: toIso(doc.consumedAt), requestIp: doc.requestIp ?? undefined, createdAt: new Date(doc.createdAt).toISOString() });
const sessionFromDoc = (doc: any): Session => ({ id: doc.id, userId: doc.userId, refreshJti: doc.refreshJti, userAgent: doc.userAgent ?? undefined, ip: doc.ip ?? undefined, expiresAt: new Date(doc.expiresAt).toISOString(), revokedAt: toIso(doc.revokedAt), createdAt: new Date(doc.createdAt).toISOString() });
const bookingFromDoc = (doc: any): Booking => ({ id: doc.id, userId: doc.userId, vertical: doc.vertical, status: doc.status, providerRef: doc.providerRef ?? undefined, request: doc.request, response: doc.response ?? undefined, createdAt: new Date(doc.createdAt).toISOString(), updatedAt: new Date(doc.updatedAt).toISOString() });
const paymentFromDoc = (doc: any): Payment => ({ id: doc.id, bookingId: doc.bookingId, userId: doc.userId, provider: doc.provider, amount: Number(doc.amount), currency: doc.currency, status: doc.status, transactionRef: doc.transactionRef ?? undefined, providerPayload: doc.providerPayload ?? undefined, createdAt: new Date(doc.createdAt).toISOString(), updatedAt: new Date(doc.updatedAt).toISOString() });
const ticketFromDoc = (doc: any): SupportTicket => ({ id: doc.id, userId: doc.userId ?? undefined, name: doc.name, mobile: doc.mobile, email: doc.email, subject: doc.subject, status: doc.status, createdAt: new Date(doc.createdAt).toISOString(), updatedAt: new Date(doc.updatedAt).toISOString() });
const tourFromDoc = (doc: any): Tour => ({ id: doc.id, slug: doc.slug, title: doc.title, country: doc.country, tourType: doc.tourType, destinations: Array.isArray(doc.destinations) ? doc.destinations : [], durationDays: Number(doc.durationDays), durationNights: Number(doc.durationNights), description: doc.description ?? '', imageUrl: doc.imageUrl ?? '', priceBdt: Number(doc.priceBdt), status: doc.status, featured: Boolean(doc.featured), createdBy: doc.createdBy ?? undefined, createdAt: new Date(doc.createdAt).toISOString(), updatedAt: new Date(doc.updatedAt).toISOString() });

export interface Store {
  health(): Promise<boolean>;
  findUserByIdentity(identity: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  createUser(input: CreateUser): Promise<User>;
  setUserRole(id: string, role: User['role']): Promise<User | undefined>;
  createOtp(input: CreateOtp): Promise<OtpChallenge>;
  findOtp(id: string): Promise<OtpChallenge | undefined>;
  incrementOtpAttempts(id: string): Promise<OtpChallenge | undefined>;
  consumeOtp(id: string): Promise<void>;
  countRecentOtpRequests(identity: string, since: Date): Promise<number>;
  createSession(input: CreateSession): Promise<Session>;
  findSessionById(id: string): Promise<Session | undefined>;
  findSessionByRefreshJti(jti: string): Promise<Session | undefined>;
  revokeSession(id: string): Promise<void>;
  createBooking(input: CreateBooking): Promise<Booking>;
  updateBooking(id: string, patch: Partial<Pick<Booking, 'status' | 'providerRef' | 'response'>>): Promise<Booking | undefined>;
  findBooking(id: string, userId?: string): Promise<Booking | undefined>;
  listBookings(userId: string): Promise<Booking[]>;
  listTours(filters?: TourFilters): Promise<Tour[]>;
  findTour(idOrSlug: string): Promise<Tour | undefined>;
  createTour(input: CreateTour): Promise<Tour>;
  updateTour(id: string, patch: UpdateTour): Promise<Tour | undefined>;
  archiveTour(id: string): Promise<Tour | undefined>;
  tourStats(): Promise<{ total: number; published: number; draft: number; archived: number }>;
  createPayment(input: CreatePayment): Promise<Payment>;
  updatePayment(id: string, patch: Partial<Pick<Payment, 'status' | 'transactionRef' | 'providerPayload'>>): Promise<Payment | undefined>;
  createSupportTicket(input: CreateTicket): Promise<SupportTicket>;
  audit(action: string, input: { userId?: string; ip?: string; userAgent?: string; metadata?: unknown }): Promise<void>;
}

export const seedTours: CreateTour[] = [
  { slug: 'coxs-bazar-saint-martins-family-package', title: 'Cox’s Bazar – Saint Martins Island Package', country: 'Bangladesh', tourType: 'Family Tour', destinations: ["Cox's Bazar", 'St. Martins'], durationDays: 4, durationNights: 3, description: 'A relaxed family escape across the sea beach and island landscapes of Bangladesh.', imageUrl: '/assets/images__phuket.jpg', priceBdt: 11800, status: 'published', featured: true },
  { slug: 'dhaka-coxs-bazar-dhaka-family-tour', title: 'Dhaka – Cox’s Bazar – Dhaka Tour Package', country: 'Bangladesh', tourType: 'Family Tour', destinations: ["Cox's Bazar"], durationDays: 3, durationNights: 2, description: 'A comfortable family-friendly coastal getaway from Dhaka.', imageUrl: '/assets/images__maldives.jpg', priceBdt: 6500, status: 'published', featured: true },
  { slug: 'dhaka-rangamati-bandarban-coxs-bazar', title: 'Dhaka – Rangamati – Bandarban – Cox’s Bazar', country: 'Bangladesh', tourType: 'Adventure Tour', destinations: ['Rangamati', 'Bandarban', "Cox's Bazar"], durationDays: 4, durationNights: 3, description: 'Hill tracts, waterfalls and the longest natural sea beach in one route.', imageUrl: '/assets/images__venice.jpg', priceBdt: 15200, status: 'published', featured: false },
  { slug: 'sreemangal-sylhet-nature-tour', title: 'Sreemangal and Sylhet Nature Tour', country: 'Bangladesh', tourType: 'Nature Tour', destinations: ['Sreemangal', 'Sylhet'], durationDays: 5, durationNights: 4, description: 'Tea gardens, waterfalls and green landscapes for curious travellers.', imageUrl: '/assets/images__dubai.jpg', priceBdt: 13800, status: 'published', featured: false }
];

export class MemoryStore implements Store {
  private users = new Map<string, User>(); private identities = new Map<string, string>(); private otps = new Map<string, OtpChallenge>(); private sessions = new Map<string, Session>(); private bookings = new Map<string, Booking>(); private payments = new Map<string, Payment>(); private tickets = new Map<string, SupportTicket>(); private tours = new Map<string, Tour>();
  constructor() { seedTours.forEach(input => { const time = now(); const tour: Tour = { id: randomUUID(), ...input, createdAt: time, updatedAt: time }; this.tours.set(tour.id, tour); }); }
  async health() { return true; }
  async findUserByIdentity(identity: string) { const id = this.identities.get(identity); return id ? this.users.get(id) : undefined; }
  async findUserById(id: string) { return this.users.get(id); }
  async createUser(input: CreateUser) { const time = now(); const user: User = { id: randomUUID(), phone: input.channel === 'sms' ? input.identity : undefined, email: input.channel === 'email' ? input.identity : undefined, fullName: input.fullName, status: 'active', role: input.role ?? 'customer', createdAt: time, updatedAt: time }; this.users.set(user.id, user); this.identities.set(input.identity, user.id); return user; }
  async setUserRole(id: string, role: User['role']) { const user = this.users.get(id); if (!user) return undefined; user.role = role; user.updatedAt = now(); return user; }
  async createOtp(input: CreateOtp) { const item = { ...input, createdAt: now() }; this.otps.set(item.id, item); return item; }
  async findOtp(id: string) { return this.otps.get(id); }
  async incrementOtpAttempts(id: string) { const item = this.otps.get(id); if (!item) return undefined; item.attempts += 1; return item; }
  async consumeOtp(id: string) { const item = this.otps.get(id); if (item) item.consumedAt = now(); }
  async countRecentOtpRequests(identity: string, since: Date) { return [...this.otps.values()].filter(item => item.identity === identity && new Date(item.createdAt) >= since).length; }
  async createSession(input: CreateSession) { const item = { ...input, createdAt: now() }; this.sessions.set(item.id, item); return item; }
  async findSessionById(id: string) { return this.sessions.get(id); }
  async findSessionByRefreshJti(jti: string) { return [...this.sessions.values()].find(item => item.refreshJti === jti); }
  async revokeSession(id: string) { const item = this.sessions.get(id); if (item) item.revokedAt = now(); }
  async createBooking(input: CreateBooking) { const time = now(); const booking: Booking = { id: randomUUID(), userId: input.userId, vertical: input.vertical, status: input.status ?? 'pending', request: input.request, createdAt: time, updatedAt: time }; this.bookings.set(booking.id, booking); return booking; }
  async updateBooking(id: string, patch: Partial<Pick<Booking, 'status' | 'providerRef' | 'response'>>) { const item = this.bookings.get(id); if (!item) return undefined; Object.assign(item, patch, { updatedAt: now() }); return item; }
  async findBooking(id: string, userId?: string) { const item = this.bookings.get(id); return item && (!userId || item.userId === userId) ? item : undefined; }
  async listBookings(userId: string) { return [...this.bookings.values()].filter(item => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async listTours(filters: TourFilters = {}) { let list = [...this.tours.values()]; if (!filters.status) list = list.filter(item => item.status === 'published'); else list = list.filter(item => item.status === filters.status); if (filters.q) { const q = filters.q.toLowerCase(); list = list.filter(item => `${item.title} ${item.country} ${item.tourType} ${item.destinations.join(' ')}`.toLowerCase().includes(q)); } if (filters.country) list = list.filter(item => item.country.toLowerCase() === filters.country!.toLowerCase()); if (filters.tourType) list = list.filter(item => item.tourType.toLowerCase() === filters.tourType!.toLowerCase()); if (filters.maxPrice !== undefined) list = list.filter(item => item.priceBdt <= filters.maxPrice!); list.sort((a, b) => filters.sort === 'price_asc' ? a.priceBdt - b.priceBdt : filters.sort === 'price_desc' ? b.priceBdt - a.priceBdt : b.createdAt.localeCompare(a.createdAt)); return list; }
  async findTour(idOrSlug: string) { return [...this.tours.values()].find(item => item.id === idOrSlug || item.slug === idOrSlug); }
  async createTour(input: CreateTour) { const time = now(); const tour: Tour = { id: randomUUID(), ...input, createdAt: time, updatedAt: time }; this.tours.set(tour.id, tour); return tour; }
  async updateTour(id: string, patch: UpdateTour) { const item = this.tours.get(id); if (!item) return undefined; Object.assign(item, patch, { updatedAt: now() }); return item; }
  async archiveTour(id: string) { return this.updateTour(id, { status: 'archived' }); }
  async tourStats() { const list = [...this.tours.values()]; return { total: list.length, published: list.filter(item => item.status === 'published').length, draft: list.filter(item => item.status === 'draft').length, archived: list.filter(item => item.status === 'archived').length }; }
  async createPayment(input: CreatePayment) { const time = now(); const item: Payment = { id: randomUUID(), ...input, status: input.status ?? 'created', createdAt: time, updatedAt: time }; this.payments.set(item.id, item); return item; }
  async updatePayment(id: string, patch: Partial<Pick<Payment, 'status' | 'transactionRef' | 'providerPayload'>>) { const item = this.payments.get(id); if (!item) return undefined; Object.assign(item, patch, { updatedAt: now() }); return item; }
  async createSupportTicket(input: CreateTicket) { const time = now(); const item: SupportTicket = { id: randomUUID(), ...input, status: input.status ?? 'open', createdAt: time, updatedAt: time }; this.tickets.set(item.id, item); return item; }
  async audit() { return; }
}

export class MongoStore implements Store {
  async health() { if (mongoose.connection.readyState !== 1) return false; await mongoose.connection.db?.admin().ping(); return true; }
  async findUserByIdentity(identity: string) { const doc = await UserModel.findOne({ $or: [{ phone: identity }, { email: identity }] }).lean(); return doc ? userFromDoc(doc) : undefined; }
  async findUserById(id: string) { const doc = await UserModel.findOne({ id }).lean(); return doc ? userFromDoc(doc) : undefined; }
  async createUser(input: CreateUser) { const doc = await UserModel.create({ id: randomUUID(), phone: input.channel === 'sms' ? input.identity : undefined, email: input.channel === 'email' ? input.identity : undefined, fullName: input.fullName, role: input.role ?? 'customer' }); return userFromDoc(doc); }
  async setUserRole(id: string, role: User['role']) { const doc = await UserModel.findOneAndUpdate({ id }, { $set: { role } }, { new: true }).lean(); return doc ? userFromDoc(doc) : undefined; }
  async createOtp(input: CreateOtp) { const doc = await OtpModel.create({ ...input, expiresAt: new Date(input.expiresAt) }); return otpFromDoc(doc); }
  async findOtp(id: string) { const doc = await OtpModel.findOne({ id }).lean(); return doc ? otpFromDoc(doc) : undefined; }
  async incrementOtpAttempts(id: string) { const doc = await OtpModel.findOneAndUpdate({ id }, { $inc: { attempts: 1 } }, { new: true }).lean(); return doc ? otpFromDoc(doc) : undefined; }
  async consumeOtp(id: string) { await OtpModel.updateOne({ id }, { $set: { consumedAt: new Date() } }); }
  async countRecentOtpRequests(identity: string, since: Date) { return OtpModel.countDocuments({ identity, createdAt: { $gte: since } }); }
  async createSession(input: CreateSession) { const doc = await SessionModel.create({ ...input, expiresAt: new Date(input.expiresAt) }); return sessionFromDoc(doc); }
  async findSessionById(id: string) { const doc = await SessionModel.findOne({ id }).lean(); return doc ? sessionFromDoc(doc) : undefined; }
  async findSessionByRefreshJti(jti: string) { const doc = await SessionModel.findOne({ refreshJti: jti }).lean(); return doc ? sessionFromDoc(doc) : undefined; }
  async revokeSession(id: string) { await SessionModel.updateOne({ id }, { $set: { revokedAt: new Date() } }); }
  async createBooking(input: CreateBooking) { const doc = await BookingModel.create(input); return bookingFromDoc(doc); }
  async updateBooking(id: string, patch: Partial<Pick<Booking, 'status' | 'providerRef' | 'response'>>) { const doc = await BookingModel.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean(); return doc ? bookingFromDoc(doc) : undefined; }
  async findBooking(id: string, userId?: string) { const query: any = { id }; if (userId) query.userId = userId; const doc = await BookingModel.findOne(query).lean(); return doc ? bookingFromDoc(doc) : undefined; }
  async listBookings(userId: string) { const docs = await BookingModel.find({ userId }).sort({ createdAt: -1 }).lean(); return docs.map(bookingFromDoc); }
  async listTours(filters: TourFilters = {}) { const query: any = { status: filters.status ?? 'published' }; if (filters.q) { const rx = new RegExp(filters.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); query.$or = [{ title: rx }, { country: rx }, { tourType: rx }, { destinations: rx }]; } if (filters.country) query.country = new RegExp(`^${filters.country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'); if (filters.tourType) query.tourType = new RegExp(`^${filters.tourType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'); if (filters.maxPrice !== undefined) query.priceBdt = { $lte: filters.maxPrice }; const sort: any = filters.sort === 'price_asc' ? { priceBdt: 1 } : filters.sort === 'price_desc' ? { priceBdt: -1 } : { createdAt: -1 }; const docs = await TourModel.find(query).sort(sort).lean(); return docs.map(tourFromDoc); }
  async findTour(idOrSlug: string) { const doc = await TourModel.findOne({ $or: [{ id: idOrSlug }, { slug: idOrSlug }] }).lean(); return doc ? tourFromDoc(doc) : undefined; }
  async createTour(input: CreateTour) { const doc = await TourModel.create({ id: randomUUID(), ...input }); return tourFromDoc(doc); }
  async updateTour(id: string, patch: UpdateTour) { const doc = await TourModel.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean(); return doc ? tourFromDoc(doc) : undefined; }
  async archiveTour(id: string) { return this.updateTour(id, { status: 'archived' }); }
  async tourStats() { const rows = await TourModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]); const stats = { total: 0, published: 0, draft: 0, archived: 0 }; rows.forEach(row => { stats[row._id as 'published' | 'draft' | 'archived'] = row.count; stats.total += row.count; }); return stats; }
  async createPayment(input: CreatePayment) { const doc = await PaymentModel.create(input); return paymentFromDoc(doc); }
  async updatePayment(id: string, patch: Partial<Pick<Payment, 'status' | 'transactionRef' | 'providerPayload'>>) { const doc = await PaymentModel.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean(); return doc ? paymentFromDoc(doc) : undefined; }
  async createSupportTicket(input: CreateTicket) { const doc = await SupportTicketModel.create(input); return ticketFromDoc(doc); }
  async audit(action: string, input: { userId?: string; ip?: string; userAgent?: string; metadata?: unknown }) { await AuditModel.create({ action, ...input }); }
}

export function connectMongo() { mongoose.set('strictQuery', true); return mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 20, minPoolSize: config.isProduction ? 2 : 0 }); }
export function createStore(): { store: Store; connection?: Promise<typeof mongoose> } { if (config.dataMode === 'mongodb') return { store: new MongoStore(), connection: connectMongo() }; return { store: new MemoryStore() }; }
