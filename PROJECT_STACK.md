# Sadik Travels Stack

## Runtime

- Node.js 20+
- Express 5
- TypeScript
- Vanilla HTML/CSS/JavaScript frontend
- SQLite using `better-sqlite3`
- JWT access/refresh sessions
- HttpOnly cookies
- Zod validation
- Helmet security headers
- Pino logging
- Nodemailer SMTP email delivery
- BulkSMSBD SMS delivery

## Single project layout

Frontend and backend are intentionally in one project. Run from the project root:

```powershell
npm run dev
```

The Express process serves:

- `/` — storefront
- `/admin` — admin console
- `/api/v1/*` — backend API

## Database

SQLite is the only database layer. Tables are created automatically in `src/store.ts`:

- users
- OTP challenges
- sessions
- bookings
- tours
- payments
- support tickets
- notifications
- audit logs

No tour demo rows are seeded. Admins create and edit all tour packages through `/admin`.

For Render, attach a persistent disk and set:

```env
SQLITE_PATH=/var/data/sadik.sqlite
```

## API client

Both storefront and admin load `api.js`:

```javascript
window.SadikApi.request(path, options)
```

It uses same-origin requests, cookies, refresh handling, and consistent API errors.

## Responsive navigation

At phone widths:

- Hamburger menu is hidden
- Bottom navigation is shown
- Flights, Hotels, Tours, Login, and More are available
- More opens Homes, Visa, eSIM, Offers, Support, and Notifications

## Render

`render.yaml` configures a single Node web service. Build and start commands are:

```text
npm ci && npm run build
npm start
```

A persistent Render disk is required for SQLite data to survive deployments.

## Admin integrations

The admin console includes an encrypted integration settings workspace for:

- SSLCommerz store ID, password, API URL, validation URL and IPN URL
- bKash app key, app secret, username, password and base URL
- SMS gateway URL, API key and sender ID
- SMTP host, port, user, password and from address
- Live travel provider URL and API key
- Brand and support contact fields

Secret values are encrypted with AES-256-GCM using `SETTINGS_MASTER_KEY`; admin responses return only a masked value. The admin console also includes role management for customer, manager and admin users, plus SMS/email test actions.
