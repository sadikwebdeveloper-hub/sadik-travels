# Amy travel website + MongoDB backend

This project contains the Amy-style travel storefront, the Go Get Tour catalogue, and a separate Node.js/TypeScript backend in `backend/`.

## Run the full app

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:8787`.

The backend serves the UI and API from one origin. The browser uses the shared `api.js` client for authentication, search, tour results, bookings, payments, account actions, and admin requests.

> The default `.env.example` uses MongoDB. For a UI-only preview without MongoDB, set `DATA_MODE=memory` and keep the mock providers enabled.

## Folder structure

```text
/
├── index.html                 # Amy storefront
├── styles.css                 # Storefront styles
├── app.js                    # Storefront interactions
├── api.js                    # Shared same-origin API client
├── admin.html                # Go Get Tour admin console
├── admin.css
├── admin.js
├── assets/                   # Local images and fonts
└── backend/
    ├── src/                  # Express + TypeScript API
    │   ├── app.ts
    │   ├── index.ts
    │   ├── store.ts          # MongoDB/Mongoose store + memory preview store
    │   ├── security.ts       # OTP, JWT and secure cookies
    │   ├── providers.ts      # Travel, messaging and payment adapters
    │   ├── middleware.ts
    │   └── rate-limit.ts
    ├── package.json
    ├── .env.example
    ├── Dockerfile
    └── docker-compose.yml
```

## MongoDB

Set:

```env
DATA_MODE=mongodb
MONGODB_URI=mongodb://127.0.0.1:27017/amy
```

Mongoose creates the collections and indexes used by:

- Users and admin roles
- OTP challenges
- Sessions
- Bookings
- Payments
- Support tickets
- Tour packages
- Audit logs

Seed the development Go Get Tour packages into MongoDB with:

```bash
cd backend
npm run seed
```

## Go Get Tour

The storefront includes a tour search route compatible with:

```text
/search?type=tour&destination=Bangladesh&tour_type=Family+Tour
```

Features include destination/type/budget filters, sorting, package cards, duration/location badges, details, login-required tour booking, payment intent creation, and a URL-driven results page.

## Admin

Open:

```text
http://localhost:8787/admin
```

Add a normalized admin identity in `backend/.env`:

```env
ADMIN_IDENTITIES=01713000000
```

Admin users authenticate with the same OTP flow and can create, edit, publish, draft, feature, search, and archive tour packages.

## Production

The API is production-oriented but live bookings, payments, messaging, and supplier inventory require real provider credentials and contracts. Production configuration intentionally refuses unsafe values such as mock providers, memory storage, echoed OTPs, insecure cookies, missing MongoDB, or missing Redis.

See:

- `backend/PRODUCTION.md`
- `backend/API.md`
- `backend/.env.example`
