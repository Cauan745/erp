# Stockroom ERP

Stockroom is a local-first Expo and React Native sales app with a Go and PostgreSQL backend in the same repository.

## Repository layout

- `app/` contains the Expo mobile client. It still uses Expo SQLite and works without the backend.
- `backend/` contains the Go HTTP service, PostgreSQL migration, and API repository code.
- `docker-compose.yml` starts PostgreSQL for local backend development.

## Run the mobile app

```bash
cd app
npm install
npx expo prebuild
npx expo run:android     # or: npx expo run:ios
```

VisionCamera needs a native development build. Expo Go cannot load the scanner module.

## Run the backend

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Start the API in another terminal:

```bash
cd backend
go run ./cmd/server
```

The service listens on `http://localhost:8080`. It runs the embedded PostgreSQL migrations on startup and seeds the three sample products used by the mobile MVP. Set `DATABASE_URL` and `HTTP_ADDR` to override the defaults in `backend/.env.example`.

## API endpoints

The API stores money as integer cents in JSON fields such as `priceCents` and `totalCents`.

- `GET /healthz`
- `GET /api/v1/products`
- `POST /api/v1/products`
- `GET /api/v1/products/by-barcode?barcode=...`
- `POST /api/v1/products/{id}/stock`
- `GET /api/v1/stock/history?limit=50`
- `PATCH /api/v1/stock/adjustments/{id}`
- `GET /api/v1/sales`
- `POST /api/v1/sales/checkout`
- `POST /api/v1/sync/push`
- `GET /api/v1/sync/pull?after=0&limit=100`

Checkout validates stock, locks the product rows, decrements stock, stores the sale, and stores product name and price snapshots in one PostgreSQL transaction. The explicit `allowInsufficientStockProductIds` request field supports the app's "sell anyway" path.

The mobile app writes products, stock changes, sales, and synchronization operations to SQLite in one local transaction. A foreground sync worker pushes durable outbox operations and pulls server changes when the app starts, returns to the foreground, and while it remains active. Network failures do not block local work.

Each pushed operation has a client-generated UUID. PostgreSQL records processed operation IDs in the same transaction as the business change, so retrying after a lost response returns the previous result instead of creating a duplicate sale or stock change. Pull uses the server's monotonic change sequence. Product edits use optimistic version checks; stock changes are deltas, not quantity overwrites. If a pulled server change overlaps an unacknowledged local operation, the server snapshot is applied so the cursor can advance, while a durable local conflict record is retained and the local operation remains available for retry or resolution. Normal server-side insufficient-stock conflicts are rejected, while the existing explicit "sell anyway" operation can create negative stock.

The sync worker runs while the app is active and registers an Expo background task with a 15-minute minimum interval. The operating system controls whether and when that task runs; it is best-effort and never replaces foreground synchronization or blocks local selling. A native development build is required for background execution; Expo Go does not provide it.

## Checks

```bash
make app-typecheck
make backend-test
```
