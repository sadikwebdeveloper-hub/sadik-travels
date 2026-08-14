# Sadik Travels

Single-project Node.js travel platform for Sadik Travels. The frontend, Express backend, SQLite database layer, admin console, authentication, Go Get Tour catalogue, and notifications run from one folder.

## Run on Windows 11 or locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open:

```text
http://localhost:8787
http://localhost:8787/admin
```

Use `DATA_MODE` no longer; SQLite is the only database layer. Configure:

```env
SQLITE_PATH=./data/sadik.sqlite
ADMIN_IDENTITIES=01713000000
DEV_OTP_ECHO=true
```

`DEV_OTP_ECHO=true` is only for local development when BulkSMSBD is not configured. Use `false` in production.

## Project structure

```text
/
├── index.html              # Sadik Travels storefront
├── styles.css
├── app.js
├── api.js                  # Shared browser API client
├── admin.html              # Admin console
├── admin.css
├── admin.js
├── src/                    # Node.js + TypeScript backend
│   ├── app.ts
│   ├── index.ts
│   ├── store.ts            # SQLite database and repository methods
│   ├── providers.ts        # Travel, payment, SMS and email providers
│   ├── security.ts
│   ├── middleware.ts
│   └── rate-limit.ts
├── package.json
├── .env.example
└── render.yaml
```

## Data

SQLite creates its tables automatically on startup. There are no demo tour rows or fake provider results. Create all Go Get Tour packages through `/admin`.

For Render, use a persistent disk and set:

```env
SQLITE_PATH=/var/data/sadik.sqlite
```

Without a persistent disk, SQLite data is lost whenever the Render service is redeployed or restarted.

## Render deployment

This project includes `render.yaml`.

Recommended Render settings:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /healthz
```

Set the required environment variables in Render, including:

- `SQLITE_PATH=/var/data/sadik.sqlite`
- `JWT_SECRET`
- `ADMIN_IDENTITIES`
- `SMS_PROVIDER`
- `SMS_GATEWAY_URL`
- `SMS_GATEWAY_USERNAME`
- `SMS_GATEWAY_PASSWORD`
- `BULKSMSBD_API_KEY` (fallback)
- `BULKSMSBD_SENDER_ID` (fallback)
- SMTP settings
- Live travel provider credentials
- Live payment provider credentials

The Render service serves both frontend and backend from the same origin, so no CORS or separate frontend server is required.

## Admin integrations and notifications

The admin console contains a secure integrations workspace for SSLCommerz, bKash, BulkSMSBD, SMTP email, live travel providers, brand contact fields, role management, product visibility toggles for Flights, Hotels, Homes, Visa, Tours and eSIM, and provider test actions. Secret values are encrypted with `SETTINGS_MASTER_KEY` and displayed masked after saving.

Admin users can also send website notifications, SMS, and email from `/admin`. Signed-in users see website notifications under the notification bell.

SMS can use the configured JSON gateway or BulkSMSBD fallback. Email uses SMTP.

## Checks

```powershell
npm run typecheck
npm run build
npm audit
```
