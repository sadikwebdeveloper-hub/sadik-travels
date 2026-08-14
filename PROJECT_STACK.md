# Amy Travel Project Stack and Backend Architecture

## What is used

### Frontend

- Plain HTML5
- CSS3 with responsive breakpoints
- Vanilla JavaScript
- Local SVG icon sprite
- Local Amy images and fonts
- `api.js` as the single shared browser API client

### Backend

- Node.js 20+
- TypeScript
- Express 5
- Mongoose 8
- MongoDB
- Redis for distributed rate limiting in production
- JWT access/refresh sessions
- HttpOnly cookies
- Passwordless OTP authentication
- Zod request validation
- Helmet security headers
- CORS with explicit origins
- Pino HTTP logging
- Docker and Docker Compose

## Backend location

All backend files are under:

```text
backend/
```

The backend does not depend on frontend source files at runtime except for serving the built static UI from its `public` directory in the Docker image.

## Browser-to-backend connection

Both the storefront and admin console load:

```html
<script src="api.js"></script>
```

`api.js` exposes:

```javascript
window.AmyApi.request(path, options)
window.AmyApi.get(path)
window.AmyApi.post(path, body)
window.AmyApi.patch(path, body)
window.AmyApi.delete(path)
```

It automatically:

- Uses same-origin relative requests
- Sends cookies with `credentials: include`
- Refreshes an expired access session once
- Preserves API error codes and HTTP status
- Works for both the storefront and `/admin`

## MongoDB collections

Mongoose models are defined in `backend/src/store.ts`:

- `AmyUser`
- `AmyOtp`
- `AmySession`
- `AmyBooking`
- `AmyPayment`
- `AmySupportTicket`
- `AmyTour`
- `AmyAudit`

MongoDB is the source of truth when:

```env
DATA_MODE=mongodb
```

A memory store remains available only for development previews where no MongoDB instance is available.

## Main API groups

### Authentication

- `POST /api/v1/auth/request-otp`
- `POST /api/v1/auth/verify-otp`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

### Travel and tours

- `POST /api/v1/search/:vertical`
- `GET /api/v1/tours`
- `GET /api/v1/tours/:idOrSlug`
- `POST /api/v1/bookings`
- `GET /api/v1/bookings`
- `POST /api/v1/bookings/:id/cancel`

Supported verticals:

```text
flight, hotel, home, visa, esim, tour
```

### Admin tour catalogue

- `GET /api/v1/admin/me`
- `GET /api/v1/admin/stats`
- `GET /api/v1/admin/tours`
- `POST /api/v1/admin/tours`
- `PATCH /api/v1/admin/tours/:id`
- `DELETE /api/v1/admin/tours/:id`

Admin routes require `admin` or `manager` role. Admin promotion is controlled by the server-side `ADMIN_IDENTITIES` allowlist.

## Development commands

```bash
cd backend
npm install
npm run dev       # watch mode
npm run typecheck
npm run build
npm run seed      # seed MongoDB tour packages
```

## Production requirements

Before production deployment, configure:

- Managed MongoDB with backups and TLS
- Managed Redis
- Real SMS/email OTP provider
- Real flight/hotel/tour provider APIs
- Real payment gateway and signed webhook
- HTTPS reverse proxy
- Strong `JWT_SECRET`
- `COOKIE_SECURE=true`
- Explicit `APP_ORIGIN` and `CORS_ORIGINS`
- `DEV_OTP_ECHO=false`

The generic provider adapters intentionally fail rather than pretending to provide live inventory or payment confirmation without real credentials.
