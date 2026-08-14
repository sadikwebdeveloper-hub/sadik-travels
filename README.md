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

SQLite is the only database layer. Configure:

```env
SQLITE_PATH=./data/sadik.sqlite
ADMIN_IDENTITIES=
DEV_OTP_ECHO=true
```

`DEV_OTP_ECHO=true` is only for local development when a real SMS provider is not configured. Use `false` in production.

For deployments without an interactive console, set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in the deployment secret store before the first start. The application creates the super admin against the configured SQLite database, stores only a password hash, and does not overwrite an existing password automatically. Remove those two bootstrap variables after the first successful deployment. Never put the password in source code or a start command.

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
│   ├── admin-bootstrap.ts  # Optional first-run admin bootstrap
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
Build command: npm ci --include=dev && npm run build
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

The admin console contains a secure integrations workspace for SSLCommerz, bKash, BulkSMSBD, SMTP email, live travel providers, brand contact fields, role management, product visibility toggles for Flights, Hotels, Homes, Visa, Tours and eSIM, provider test actions, a real booking assignment/lifecycle queue, support-ticket management, dashboard metrics from SQLite, and a persisted content studio for destinations, hotels, homes, visa, eSIM, offers, banners, airlines, FAQs and company blocks. Secret values are encrypted with `SETTINGS_MASTER_KEY` and displayed masked after saving.

Admin users can also send website notifications, SMS, and email from `/admin`. Signed-in users see website notifications under the notification bell.

SMS can use a configured form-data custom gateway or BulkSMSBD fallback. Email uses SMTP. If a provider is not configured, the UI reports an explicit unavailable state rather than simulating delivery. The temporary credentials previously shared during setup should be rotated and are not stored in this project.

## Checks

```powershell
npm run typecheck
npm run build
npm audit
```
