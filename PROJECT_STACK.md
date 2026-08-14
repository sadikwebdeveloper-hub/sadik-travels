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
