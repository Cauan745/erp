# Agent instructions

## Project purpose

Stockroom is an Expo and React Native ERP MVP for local product sales.

The current scope is local-only:

- Scan product barcodes.
- Add products to a cart.
- Check out cash sales.
- Store products, stock, and sales on the device.

Object recognition, cross-device sync, accounts, device identity, and a backend are planned work. Do not add them unless the user requests them.

## Source of truth

The original project plan mentioned RxDB with SQLite storage. The implementation has since moved to direct `expo-sqlite`.

Do not reintroduce RxDB or its storage plugin unless the user explicitly asks for that change. The current database code is under `src/db/`.

## Localization

- The app uses the typed i18n layer under `src/i18n/`.
- Brazilian Portuguese (`pt-BR`) is the default locale. Keep English translations available as the fallback.
- Put every user-facing string in the translation dictionaries, including labels, placeholders, alerts, toasts, empty states, and native permission text.
- Do not translate internal identifiers, database values, enum names, SQL literals, product data, stock adjustment reasons, sale snapshots, or logs. Translate enum-like values only at the UI boundary.
- Repository errors should use internal error codes. The UI translates those codes before displaying them.
- Use `Intl.NumberFormat` with BRL for money and locale-aware date formatting. Keep product prices stored as integer cents in SQLite.

## Important files

- `App.tsx` contains the UI, navigation tabs, barcode scanner modal, cart, checkout modal, and startup error handling.
- `src/db/db.ts` opens the `stockroom` SQLite database, enables foreign keys, applies the database version, seeds initial products, and retries cleanly after initialization errors.
- `src/db/product/schema.ts` defines the products table, indexes, and seed products.
- `src/db/product/repository.ts` contains product reads, product creation, and barcode lookup.
- `src/db/product/types.ts` defines the UI-facing `Product` type.
- `src/db/sale/schema.ts` defines sales and sale item tables and indexes.
- `src/db/sale/repository.ts` contains sales listing and checkout transactions.
- `src/db/sale/types.ts` defines `Sale` and `SaleLine`.
- `src/db/index.ts` is the database repository export surface used by the app.
- `app.json` configures Expo, VisionCamera permissions, and the SQLite plugin.
- `Makefile` provides the `make run` command.

## Database rules

- Keep the database name as `stockroom` unless a migration plan requires a change.
- Store money in integer cents in SQLite columns such as `price_cents` and `total_cents`.
- Convert cents to decimal numbers only at the repository boundary used by the UI.
- Use parameterized SQLite queries for user or document values.
- Increment `DATABASE_VERSION` when changing the schema.
- Apply schema changes inside the versioned transaction in `src/db/db.ts`.
- Preserve existing local data during migrations. Do not delete or recreate tables as a shortcut.
- Keep the partial unique barcode index. Empty barcodes must remain allowed, but non-empty barcodes must be unique.
- Checkout must remain transactional. It validates stock, decrements stock, inserts the sale, and inserts sale items as one operation.
- Sale items must keep product name and price snapshots so sale history remains stable after a product changes.
- Keep stock validation for normal checkout, but allow the explicit "Sell anyway" override to make stock negative.
- Store manual signed stock changes in `stock_adjustments`; each manual change must update `products.stock` and insert its history row in one transaction.
- Do not copy sale stock changes into `stock_adjustments`. Combine sales and manual adjustments when displaying stock history.

## Native and platform rules

- The app uses `react-native-vision-camera`, so it needs a native development build. Expo Go cannot load this scanner module.
- `npm run android` runs `expo run:android --device`, which targets a connected physical device or lets Expo select a device.
- `make run` calls `npm run android`.
- Use USB debugging or an Android device connected through ADB when running on a phone.
- `npm run start` starts the Expo development server without building or installing the native app.
- Use `react-native-safe-area-context` for system bar insets. Do not replace it with the core React Native `SafeAreaView` without checking Android behavior.
- Prefer `app.json` and config plugins for native configuration. Generated native files may be overwritten by Expo prebuild.

## Development commands

```bash
npm install
make run
npm run start
npm run ios
npm run web
npm run typecheck
```

Run `npm run typecheck` after TypeScript changes. There is currently no automated test script.

## Code conventions

- Keep database access in repositories under `src/db/`. UI components should call repository functions instead of composing SQL.
- Keep database errors visible to the user through the existing startup error screen or an alert for an action failure.
- Keep product and sale types separate from raw SQLite row types. Map snake_case database rows to camelCase app objects in repositories.
- Preserve the existing local-first behavior. A new product or sale should be usable immediately without network access.
- Avoid adding network, sync, authentication, or object-recognition code as part of unrelated MVP changes.
