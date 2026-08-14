import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { AppError } from './errors.js';

async function requestJson(baseUrl: string, apiKey: string, path: string, payload: unknown, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, baseUrl).toString(), { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey }, body: JSON.stringify(payload) });
    const body = await response.text();
    let parsed: unknown;
    try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { raw: body }; }
    if (!response.ok) throw new AppError(502, 'PROVIDER_ERROR', `Provider returned HTTP ${response.status}`, config.isProduction ? undefined : parsed);
    return parsed;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, 'PROVIDER_UNAVAILABLE', 'The external provider is unavailable');
  } finally { clearTimeout(timeout); }
}

export type Vertical = 'flight' | 'hotel' | 'home' | 'visa' | 'esim' | 'tour';

export class TravelProvider {
  async search(vertical: Vertical, payload: unknown) {
    if (config.providerMode === 'live') return requestJson(config.providerBaseUrl, config.providerApiKey, `/v1/${vertical}/search`, payload, config.providerTimeoutMs);
    const id = `DEMO-${vertical.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    if (vertical === 'flight') return { searchId: id, currency: 'BDT', results: [{ id: `${id}-1`, airline: 'Amy Partner Airways', route: 'Dhaka → Dubai', duration: '5h 30m', stops: 0, price: 18450 }, { id: `${id}-2`, airline: 'Value Air', route: 'Dhaka → Dubai', duration: '6h 15m', stops: 1, price: 16100 }] };
    if (vertical === 'hotel') return { searchId: id, currency: 'BDT', results: [{ id: `${id}-1`, name: "Sayeman Beach Resort", city: "Cox's Bazar", rating: 4.6, pricePerNight: 8500 }, { id: `${id}-2`, name: 'Ocean Paradise', city: "Cox's Bazar", rating: 4.4, pricePerNight: 6200 }] };
    if (vertical === 'home') return { searchId: id, currency: 'BDT', results: [{ id: `${id}-1`, title: 'Modern apartment near Gulshan', city: 'Dhaka', type: 'rent', price: 55000 }, { id: `${id}-2`, title: 'Family home in Bashundhara', city: 'Dhaka', type: 'buy', price: 12500000 }] };
    if (vertical === 'visa') return { searchId: id, results: [{ id: `${id}-1`, country: 'United Arab Emirates', category: 'Tourist Visa', processingTime: '3–5 working days' }, { id: `${id}-2`, country: 'Thailand', category: 'Tourist Visa', processingTime: '5–7 working days' }] };
    return { searchId: id, currency: 'BDT', results: [{ id: `${id}-1`, country: 'Singapore', plan: '5 GB / 15 days', price: 750 }, { id: `${id}-2`, country: 'Singapore', plan: '10 GB / 30 days', price: 1200 }] };
  }
  async reserve(vertical: Vertical, payload: unknown) {
    if (config.providerMode === 'live') return requestJson(config.providerBaseUrl, config.providerApiKey, `/v1/${vertical}/bookings`, payload, config.providerTimeoutMs);
    return { providerRef: `DEMO-${vertical.toUpperCase()}-BOOK-${Date.now().toString(36).toUpperCase()}`, status: 'pending', message: 'Demo booking created; connect a live provider to confirm.' };
  }
  async cancel(vertical: Vertical, payload: unknown) {
    if (config.providerMode === 'live') return requestJson(config.providerBaseUrl, config.providerApiKey, `/v1/${vertical}/bookings/cancel`, payload, config.providerTimeoutMs);
    return { status: 'cancelled', providerRef: (payload as any)?.providerRef };
  }
}

export class MessagingProvider {
  async sendOtp(channel: 'sms' | 'email', destination: string, code: string) {
    const endpoint = channel === 'sms' ? config.smsProviderUrl : config.emailProviderUrl;
    const token = channel === 'sms' ? config.smsProviderToken : config.emailProviderToken;
    if (!endpoint || !token) {
      if (config.isProduction) throw new AppError(503, 'MESSAGING_UNAVAILABLE', 'OTP delivery is not configured');
      return { delivered: false, devCode: config.devOtpEcho ? code : undefined };
    }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(channel === 'sms' ? { to: destination, message: `Your Amy login code is ${code}. It expires in 5 minutes.` } : { to: destination, subject: 'Your Amy login code', text: `Your Amy login code is ${code}. It expires in 5 minutes.` }) });
    if (!response.ok) throw new AppError(502, 'MESSAGING_ERROR', 'OTP delivery provider rejected the request');
    return { delivered: true };
  }
}

export class PaymentProvider {
  async createIntent(payload: unknown) {
    if (config.paymentMode === 'live') return requestJson(config.paymentBaseUrl, config.paymentApiKey, '/v1/payments/intents', payload, config.providerTimeoutMs);
    return { provider: 'mock', status: 'pending', transactionRef: `DEMO-PAY-${Date.now().toString(36).toUpperCase()}`, checkoutUrl: '/?payment=demo' };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (config.paymentMode !== 'live') return true;
    if (!signature || !config.paymentWebhookSecret) return false;
    const expected = createHmac('sha256', config.paymentWebhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
