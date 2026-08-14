# Production activation checklist

This repository now contains the application boundary and secure production checks. It intentionally does not invent live provider credentials or provider-specific request/response contracts.

## Required before go-live

1. **Travel providers**
   - Set `PROVIDER_MODE=live`.
   - Set `TRAVEL_PROVIDER_BASE_URL` and `TRAVEL_PROVIDER_API_KEY`.
   - Implement the provider's `/v1/{flight|hotel|home|visa|esim}/search`, `/bookings`, and `/bookings/cancel` contract in `src/providers.ts` if its payloads differ from the generic adapter.
   - Confirm supplier ticketing, hotel confirmation, cancellation, refund, and reconciliation behavior.

2. **Bangladesh OTP delivery**
   - Configure a transactional SMS gateway under `SMS_PROVIDER_URL`/`SMS_PROVIDER_TOKEN` and/or email delivery under `EMAIL_PROVIDER_URL`/`EMAIL_PROVIDER_TOKEN`.
   - Set `DEV_OTP_ECHO=false`.
   - Verify sender ID, delivery receipts, retry behavior, and regulatory requirements.

3. **Payments**
   - Set `PAYMENT_MODE=live`, `PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_API_KEY`, and `PAYMENT_WEBHOOK_SECRET`.
   - Map the gateway's create-payment, success, failure, cancel, refund, and webhook payloads in `PaymentProvider`.
   - Register the public HTTPS webhook URL and verify signatures in the provider's sandbox before production.

4. **Infrastructure**
   - Use MongoDB with TLS/backups: `DATA_MODE=mongodb` and `MONGODB_URI`. Tour packages are created through `/admin`; no demo rows are seeded.
   - Use a managed Redis instance: `REDIS_URL`.
   - Use a strong `JWT_SECRET`, `COOKIE_SECURE=true`, explicit `APP_ORIGIN`, and explicit `CORS_ORIGINS`.
   - Put the service behind an HTTPS reverse proxy/load balancer, configure backups, alerts, log retention, and secret rotation.

5. **Admin access and catalogue**
   - Set `ADMIN_IDENTITIES` to normalized phone/email identities for Sadik Travels managers/admins.
   - Open `/admin` to manage tour packages; admin access is still protected by OTP and the server-side role allowlist.
   - Run the tour CRUD and archive flows against the MongoDB staging database before publishing.

6. **Operational sign-off**
   - Run search, booking, payment, cancellation, OTP expiry, OTP throttling, webhook replay, refund, and provider outage tests against sandbox systems.
   - Add business-specific admin roles, reconciliation jobs, KYC/AML rules, tax/invoice requirements, and customer support workflows as required by Sadik Travels policy.

The API refuses to boot with unsafe production settings, including in-memory storage, echoed OTPs, insecure cookies, missing Redis, missing BulkSMSBD/SMTP settings, or missing provider/payment credentials.

## Notifications and messaging

- **SMS:** `MessagingProvider` sends URL-encoded POST requests to BulkSMSBD's `https://bulksmsbd.net/api/smsapi` endpoint using `api_key`, `senderid`, `number`, and `message`.
- **Email:** SMTP is used through Nodemailer with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`.
- **Website:** Admins can send in-app notifications from `/admin`; signed-in users receive them under the notification bell.

Set `DEV_OTP_ECHO=false` and configure BulkSMSBD/SMTP before enabling customer notifications in production.
