# Sadik Travels API

Base URL: `/api/v1`

## Public

- `POST /auth/request-otp` — `{ "identity": "017XXXXXXXX" }`
- `POST /auth/verify-otp` — `{ "challengeId": "uuid", "code": "123456" }`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /healthz`
- `GET /readyz`
- `POST /search/:vertical` where vertical is `flight`, `hotel`, `home`, `visa`, `tour`, or `esim`.
- `GET /tours?destination=Bangladesh&tour_type=Family%20Tour&sort=price_asc`
- `GET /tours/:idOrSlug`

## Authenticated

Authentication is passwordless OTP-based. The API sets Secure/HttpOnly cookies in production and also returns the short-lived access token for clients that prefer a bearer token.

- `GET /auth/me`
- `POST /bookings` — `{ "vertical": "flight", "payload": { ... } }`
- `GET /bookings`
- `GET /bookings/:id`
- `POST /bookings/:id/cancel`
- `POST /payments/intents` — `{ "bookingId": "uuid", "amount": 18450, "currency": "BDT" }`
- `POST /support/tickets`
- `GET /notifications`
- `PATCH /notifications/:id/read`

## Admin

Admin endpoints require a user role of `admin` or `manager`; identities must be listed in `ADMIN_IDENTITIES` before their OTP login is promoted.

- `GET /admin/me`
- `GET /admin/stats`
- `GET /admin/tours`
- `POST /admin/tours`
- `PATCH /admin/tours/:id`
- `DELETE /admin/tours/:id` (archives the package)
- `POST /admin/notifications` — in-app, SMS, and email notifications to one user or all active users

The admin UI is served at `/admin`.

## Provider boundary

`src/providers.ts` contains live adapters for travel search/reservation/cancellation, BulkSMSBD/SMTP delivery, and payments. No mock inventory, demo tour rows, or fake payment responses are generated. Configure the real credentials before enabling those flows.
