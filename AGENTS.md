# Agent instructions

## Project purpose

Stockroom is an Expo and React Native ERP MVP for local product sales, with a Go and PostgreSQL backend in the same repository.

The mobile app remains local-first. The backend provides a server-side API and synchronization protocol, but SQLite remains the immediate source of truth for UI reads and writes.

The current app scope is:

- Scan product barcodes.
- Add products to a cart.
- Check out sales with cash, debit card, credit card, or Pix.
- Store products, stock, and sales on the device.

Object recognition, accounts, and device identity are planned work. Cross-device sync is implemented through `app/src/sync/` and the backend sync endpoints.

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
- `backend/internal/database/migrations/002_sync.sql` adds server operation records, product versions, tombstones, and the ordered change log.
- `backend/internal/database/migrations/003_payment_methods.sql` adds payment method fields for checkout and cash change.
- `backend/internal/repository/repository.go` contains PostgreSQL product, stock, history, and checkout operations.
- `backend/internal/repository/sync.go` processes idempotent operations and records the server change log.
- `backend/internal/httpapi/server.go` defines the JSON API, sync push/pull endpoints, and stable error codes.
- `app/src/sync/service.ts` pushes the SQLite outbox and applies paginated server changes.
- `app/src/sync/api.ts` defines the mobile sync request and response contract.
- `app/src/db/sync/repository.ts` manages outbox leases, retry state, sync cursors, and conflict records.
- `Makefile` provides root commands for the app, backend, and local PostgreSQL container.

## Database rules

- Keep the database name as `stockroom` unless a migration plan requires a change.
- Store money in integer cents in SQLite columns such as `price_cents` and `total_cents`.
- Convert cents to decimal numbers only at the repository boundary used by the UI.
- Use parameterized SQLite queries for user or document values.
- The current mobile `DATABASE_VERSION` is `7`. Increment it for every later SQLite schema change.
- The project is in beta and has no production users yet. Prefer a direct schema over compatibility columns for unused legacy behavior. Do not add a parallel field just to preserve an old constraint when the canonical field can be migrated directly.
- Apply mobile schema changes inside the versioned transaction in `app/src/db/db.ts`. Apply backend schema changes in ordered files under `backend/internal/database/migrations/`.
- Preserve existing local data during migrations. Do not delete or recreate tables as a shortcut. If SQLite cannot alter a constraint in place, use an explicit transactional copy migration that preserves dependent rows and indexes, and document why it is required.
- Keep the partial unique barcode index. Empty barcodes must remain allowed, but non-empty barcodes must be unique.
- Checkout must remain transactional. It validates stock, decrements stock, inserts the sale, and inserts sale items as one operation.
- `sales.payment_method` is the canonical payment field. Its allowed values are `cash`, `debit_card`, `credit_card`, and `pix`. Do not introduce a compatibility or detail column for these methods.
- Cash checkout stores `cash_received_cents`; derive change as `cash_received_cents - total_cents`. Non-cash checkout stores no cash amount. Validate cash received in cents before committing the sale.
- Sale items must keep product name and price snapshots so sale history remains stable after a product changes.
- Keep `sale_items.line_total_cents` even though the current MVP can derive it from quantity and unit price. Future discounts, promotions, taxes, and rounding rules may make the final line amount differ from that multiplication.
- Keep stock validation for normal checkout, but allow the explicit "Sell anyway" override to make stock negative.
- Store manual signed stock changes in `stock_adjustments`; each manual change must update `products.stock` and insert its history row in one transaction.
- Allow the user to edit only reasons stored in `stock_adjustments`; sale-derived history rows are read-only. Use the history `source` field to distinguish them, never the reason text, because a manual reason may equal `Venda` or another sale label.
- Editing a stock-adjustment reason must update only its `reason` column. It must not change the recorded quantity or product stock.
- Automatic stock added to complete a sale must store its internal reason code and translate that code only at the UI boundary.
- Product creation accepts an integer initial stock and defaults the form value to `0`.
- Do not copy sale stock changes into `stock_adjustments`. Combine sales and manual adjustments when displaying stock history.
- Every local product, sale, sale item, stock adjustment, and outbox operation created after the sync migration must use a client-generated UUID.
- Every local mutation must enqueue its sync operation in the same SQLite transaction as its business rows.
- The outbox is durable. Never delete pending or permanently rejected operations after a request failure.
- The server must process each operation ID at most once. Persist the processed operation record in the same PostgreSQL transaction as the business change.
- Inventory synchronization sends sale and signed adjustment operations. It must not overwrite server stock with a cached local quantity.
- Product changes use expected versions. A version conflict is rejected and remains visible as a failed outbox operation.
- Pull changes use the server sequence cursor. Apply a page and advance the cursor in one SQLite transaction. Preserve tombstones.

## Synchronization rules

- The mobile UI never waits for the API. It reads and writes through the local repositories, then the sync worker sends durable outbox operations later.
- Supported operation types are `product.create`, `product.update`, `product.delete`, `stock.adjustment`, `stock.reason.update`, and `sale.checkout`.
- Outbox rows use `pending`, `in_flight`, `failed`, or `acknowledged` status. A claimed row has a lease so an app crash makes it eligible again. Network failures use exponential retry delays. Permanent rejections stay in the database with their error details.
- Product create/update/delete operations depend on earlier operations for the same product. Do not remove dependency checks or send dependent operations out of order.
- Push acknowledgements are recorded only after the server returns `applied` or `already_applied`. The server stores each processed operation ID in `processed_sync_operations` in the same PostgreSQL transaction as its business changes.
- `sale.checkout` is one server transaction covering the sale, sale items, stock decrements, change-log entries, and processed-operation record. Retrying the same operation must return its stored outcome.
- Stock synchronization sends signed adjustments and sale quantities. Never send a cached product stock value as an instruction to overwrite server inventory.
- Pull requests use `server_cursor`, which is a PostgreSQL change-log sequence. The client advances it only after applying the complete page in SQLite. If applying a page fails, the transaction rolls back and the cursor stays unchanged.
- Pull tombstones prevent deleted products from reappearing. Do not replace tombstones with hard deletes unless the pull protocol changes with them.
- If a pulled change overlaps an unacknowledged local operation, apply the server snapshot, retain a row in `sync_conflicts`, and keep the local outbox operation. Product version conflicts are rejected by the server. This is the current conflict policy and must remain documented if it changes.
- The current stock policy rejects a server-side sale when stock is insufficient. The explicit local "Sell anyway" choice sends the affected product IDs and permits negative stock.
- `EXPO_PUBLIC_API_URL` overrides the API URL. Without it, Android uses `http://10.0.2.2:8080` and other platforms use `http://localhost:8080`.
- `listOutboxOperations`, `retryFailedOperation`, `listSyncConflicts`, and `resolveSyncConflict` are the repository-level inspection and recovery hooks. Keep permanently rejected operations visible to any future diagnostics UI.

## Native and platform rules

- The app uses `react-native-vision-camera`, so it needs a native development build. Expo Go cannot load this scanner module.
- Background synchronization uses `expo-background-task` and `expo-task-manager`; it is best-effort and OS-scheduled, not an always-running worker. Expo Go does not support it.
- The foreground worker attempts sync at app startup, when the app returns to the foreground, and every 60 seconds while active. The background task uses a 15-minute minimum interval, but the operating system decides whether it runs.
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

When making UI changes, run the relevant checks and then pause so the user can test and verify the behavior before creating a commit, posting an issue update, or closing an issue.

The GitHub CLI (`gh`) is available for repository operations, including listing and inspecting GitHub issues. Use the configured repository remote when checking live issue status.

## GitHub issue workflow

When fixing a GitHub issue, follow this order:

1. Read the issue details and confirm the requested behavior.
2. Implement the fix and run the relevant project checks.
3. Create the commit that contains the fix, or identify the branch or pull request that contains it.
4. Before closing the issue, add a comment that includes:
   - A link to the solving commit, branch, or pull request.
   - A short summary of how the issue was fixed.
   - A short description of what the program does after the fix.
5. Close the issue only after the comment and link are visible on the issue thread.

Do not close an issue with only a status update. If the issue was closed before the implementation link was added, add a follow-up comment with the link and the same summary instead of leaving the issue without a code reference.

The PostgreSQL integration tests run only when `TEST_DATABASE_URL` is set. They cover idempotent checkout processing and require a migrated PostgreSQL database. If Docker or PostgreSQL is unavailable, report that integration coverage was skipped instead of treating unit or HTTP tests as full database validation.

## Code conventions

- Keep mobile database access in repositories under `app/src/db/`. UI components should call repository functions instead of composing SQL.
- Keep backend database access in `backend/internal/repository/`. HTTP handlers should call repository methods instead of composing SQL.
- Keep database errors visible to the user through the existing startup error screen or an alert for an action failure.
- Keep product and sale types separate from raw SQLite row types. Map snake_case database rows to camelCase app objects in repositories.
- Preserve the existing local-first behavior. A new product or sale should be usable immediately without network access.
- Keep HTTP sync in `app/src/sync/`, never in UI components. Sync may update local SQLite after a successful local operation, but it must not gate UI success on network availability.
- Avoid adding authentication or object-recognition code as part of unrelated MVP changes.
