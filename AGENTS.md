# Agent instructions

## Project purpose

Stockroom is an Expo and React Native ERP MVP for local product sales, with a Go and PostgreSQL backend in the same repository.

The mobile app remains local-first. The backend now provides a server-side API for products, stock, sales, and checkout, but the mobile client is not connected to it yet.

The current app scope is:

- Scan product barcodes.
- Add products to a cart.
- Check out cash sales.
- Store products, stock, and sales on the device.

Object recognition, cross-device sync, accounts, and device identity are planned work. Do not add them unless the user requests them.

The repository has two top-level application folders:

- `app/` contains the Expo client and local SQLite code.
- `backend/` contains the Go HTTP service, PostgreSQL migrations, and repositories.

## Source of truth

The original project plan mentioned RxDB with SQLite storage. The implementation has since moved to direct `expo-sqlite` in `app/`.

Do not reintroduce RxDB or its storage plugin unless the user explicitly asks for that change. The current mobile database code is under `app/src/db/`.

## Localization

- The app uses the typed i18n layer under `app/src/i18n/`.
- Brazilian Portuguese (`pt-BR`) is the default locale. Keep English translations available as the fallback.
- Put every user-facing string in the translation dictionaries, including labels, placeholders, alerts, toasts, empty states, and native permission text.
- Do not translate internal identifiers, database values, enum names, SQL literals, product data, stock adjustment reasons, sale snapshots, or logs. Translate enum-like values only at the UI boundary.
- Repository errors should use internal error codes. The UI translates those codes before displaying them.
- Use `Intl.NumberFormat` with BRL for money and locale-aware date formatting. Keep product prices stored as integer cents in SQLite and PostgreSQL.

## Important files

- `app/App.tsx` contains the UI, navigation tabs, barcode scanner modal, cart, checkout modal, and startup error handling.
- `app/src/db/db.ts` opens the `stockroom` SQLite database, enables foreign keys, applies the database version, seeds initial products, and retries cleanly after initialization errors.
- `app/src/db/product/schema.ts` defines the products table, indexes, and seed products.
- `app/src/db/product/repository.ts` contains product reads, product creation, and barcode lookup.
- `app/src/db/sale/repository.ts` contains sales listing and checkout transactions.
- `app/src/db/stock/repository.ts` contains stock changes, stock-history reads, and stock-adjustment reason updates.
- `app/src/components/tabs/ProductsTab.tsx` contains product creation, product stock display, and stock history actions.
- `app/src/components/modals/StockReasonModal.tsx` edits the reason on a saved manual stock adjustment.
- `app/src/db/index.ts` is the database repository export surface used by the app.
- `app/app.json` configures Expo, VisionCamera permissions, and the SQLite plugin.
- `backend/internal/database/migrations/001_init.sql` defines the PostgreSQL schema and seed products.
- `backend/internal/repository/repository.go` contains PostgreSQL product, stock, history, and checkout operations.
- `backend/internal/httpapi/server.go` defines the JSON API and translates repository errors into stable error codes.
- `Makefile` provides root commands for the app, backend, and local PostgreSQL container.

## Database rules

- Keep the database name as `stockroom` unless a migration plan requires a change.
- Store money in integer cents in SQLite columns such as `price_cents` and `total_cents`.
- Convert cents to decimal numbers only at the repository boundary used by the UI.
- Use parameterized SQLite queries for user or document values.
- Increment `DATABASE_VERSION` when changing the schema.
- Apply mobile schema changes inside the versioned transaction in `app/src/db/db.ts`. Apply backend schema changes in ordered files under `backend/internal/database/migrations/`.
- Preserve existing local data during migrations. Do not delete or recreate tables as a shortcut.
- Keep the partial unique barcode index. Empty barcodes must remain allowed, but non-empty barcodes must be unique.
- Checkout must remain transactional. It validates stock, decrements stock, inserts the sale, and inserts sale items as one operation.
- Sale items must keep product name and price snapshots so sale history remains stable after a product changes.
- Keep stock validation for normal checkout, but allow the explicit "Sell anyway" override to make stock negative.
- Store manual signed stock changes in `stock_adjustments`; each manual change must update `products.stock` and insert its history row in one transaction.
- Allow the user to edit only reasons stored in `stock_adjustments`; sale-derived history rows are read-only. Use the history `source` field to distinguish them, never the reason text, because a manual reason may equal `Venda` or another sale label.
- Editing a stock-adjustment reason must update only its `reason` column. It must not change the recorded quantity or product stock.
- Automatic stock added to complete a sale must store its internal reason code and translate that code only at the UI boundary.
- Product creation accepts an integer initial stock and defaults the form value to `0`.
- Do not copy sale stock changes into `stock_adjustments`. Combine sales and manual adjustments when displaying stock history.

## Native and platform rules

- The app uses `react-native-vision-camera`, so it needs a native development build. Expo Go cannot load this scanner module.
- `npm --prefix app run android` runs `expo run:android --device`, which targets a connected physical device or lets Expo select a device.
- `make run` calls the app's Android command through `app/Makefile`.
- Use USB debugging or an Android device connected through ADB when running on a phone.
- `npm --prefix app run start` starts the Expo development server without building or installing the native app.
- Use `react-native-safe-area-context` for system bar insets. Do not replace it with the core React Native `SafeAreaView` without checking Android behavior.
- Prefer `app.json` and config plugins for native configuration. Generated native files may be overwritten by Expo prebuild.

## Development commands

```bash
cd app && npm install
make run
make app-start
make app-typecheck
make backend-test
```

Run `make app-typecheck` after TypeScript changes. Run `make backend-test` after Go changes. The mobile app currently has no automated test script.

## Code conventions

- Keep mobile database access in repositories under `app/src/db/`. UI components should call repository functions instead of composing SQL.
- Keep backend database access in `backend/internal/repository/`. HTTP handlers should call repository methods instead of composing SQL.
- Keep database errors visible to the user through the existing startup error screen or an alert for an action failure.
- Keep product and sale types separate from raw SQLite row types. Map snake_case database rows to camelCase app objects in repositories.
- Preserve the existing local-first behavior. A new product or sale should be usable immediately without network access.
- Avoid adding client network sync, authentication, or object-recognition code as part of unrelated MVP changes.
