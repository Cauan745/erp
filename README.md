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

Checkout validates stock, locks the product rows, decrements stock, stores the sale, and stores product name and price snapshots in one PostgreSQL transaction. The explicit `allowInsufficientStockProductIds` request field supports the app's "sell anyway" path.

The mobile app is not connected to these endpoints yet. That keeps its current offline behavior unchanged while the backend contract is established.

## Checks

```bash
make app-typecheck
make backend-test
```
