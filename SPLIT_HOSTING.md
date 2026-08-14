# Split hosting: Netlify frontend + Vercel backend

This repository supports hosting the static Sadik Travels UI on Netlify and the Express API on Vercel.

## Vercel backend

Create a Vercel project using this repository with **Root Directory** set to `backend`.

The backend entrypoint is:

```text
backend/api/index.ts
```

The Vercel project must set these environment variables:

```env
NODE_ENV=production
DATA_MODE=mongodb
MONGODB_URI=mongodb+srv://...
SERVE_STATIC=false
APP_ORIGIN=https://YOUR-NETLIFY-SITE.netlify.app
CORS_ORIGINS=https://YOUR-NETLIFY-SITE.netlify.app
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
REDIS_URL=redis://...
JWT_SECRET=...
ADMIN_IDENTITIES=...
BULKSMSBD_API_KEY=...
BULKSMSBD_SENDER_ID=...
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=...
TRAVEL_PROVIDER_BASE_URL=...
TRAVEL_PROVIDER_API_KEY=...
PAYMENT_PROVIDER_BASE_URL=...
PAYMENT_PROVIDER_API_KEY=...
PAYMENT_WEBHOOK_SECRET=...
DEV_OTP_ECHO=false
```

MongoDB must be hosted externally, normally with MongoDB Atlas. Vercel should not be expected to run MongoDB itself.

## Netlify frontend

Create a Netlify site using the repository root as the publish directory. No frontend build command is required.

Before deploying, edit `netlify.toml` and replace:

```text
YOUR-VERCEL-BACKEND.vercel.app
```

with the real Vercel backend hostname.

The Netlify rewrite proxies `/api/*` to Vercel. This is the recommended arrangement because the browser continues to call `/api/v1/...` on the Netlify origin, and the HttpOnly authentication cookies remain usable without cross-site cookie changes.

Netlify routes:

- `/` — Sadik Travels storefront
- `/admin` — admin console
- `/api/*` — proxied to Vercel backend

## Important deployment order

1. Deploy Vercel backend and confirm `/api/healthz`.
2. Add the Vercel URL to the Netlify rewrite.
3. Deploy Netlify frontend.
4. Set `APP_ORIGIN` and `CORS_ORIGINS` in Vercel to the final Netlify HTTPS URL.
5. Configure MongoDB Atlas network access and database user.
6. Configure Redis, BulkSMSBD, SMTP, travel provider, and payment provider credentials.
7. Test OTP, admin login, tour CRUD, website notifications, SMS, email, booking, and payment webhook flows.

## Why the proxy is used

Direct browser requests from Netlify to a Vercel hostname are cross-origin. Although CORS can be configured, authentication cookies become more difficult because the two hosts are different sites. The Netlify rewrite keeps the browser-facing API same-origin while Vercel remains the backend runtime.
