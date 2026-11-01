# Implementation progress

## 2026-11-01: Step 3 products and API catalog

Step 3 is implemented and has passed automated checks. The user verified product creation, editing, and soft deletion on Android. Remaining device checks are listed below. The earlier steps 1–2 baseline was committed at the user's request as `0746173`. The user requested the step 3 commit after confirming Android product CRUD and startup. The agent made no issue update or native Android build; the user built and installed the app independently.

### Product mappings, queries, DTOs, and transactions

[`Product`](../backend/src/main/java/com/stockroom/erp/product/Product.java) keeps the existing UUID, integer-cent, signed-stock, and UTC timestamp mappings from V1. `updateMetadata` assigns only name, barcode, category, cost, selling price, and updatedAt. It cannot assign stock. `hide` sets deletedAt and updatedAt once and retains the row, so foreign keys and the existing name/barcode reservation indexes continue to work. Creation stores opening stock directly without creating an adjustment. No schema change or new Flyway migration was needed.

[`ProductRepository`](../backend/src/main/java/com/stockroom/erp/product/ProductRepository.java) still extends `JpaRepository`. `saveAndFlush` handles creation; managed entity dirty checking handles metadata updates and deletion. The derived `findByBarcodeAndDeletedAtIsNull` query finds an exact active barcode. `findActiveOrdered` is a native read query because PostgreSQL `translate` and C collation must match the contract's ASCII-only name ordering. It filters hidden products and orders by createdAt descending, folded name, then UUID. Ordinary writes remain JPA operations. No duplicate-name precheck uses a broader case-folding rule.

[`ProductService`](../backend/src/main/java/com/stockroom/erp/product/ProductService.java) owns the transaction boundary. Creation trims strings and defaults blank categories, empty barcodes, and omitted opening stock. Update and deletion first call `findByIdForUpdate`, including hidden rows, under READ COMMITTED with a 20-second transaction limit. They do not first load an unlocked product or merge a request-built entity. Updates reject hidden products; repeated deletion returns 204 without changing its timestamp. The configured 5-second PostgreSQL lock timeout returns `503 inventory_busy` after rollback.

[`CreateProductRequest`](../backend/src/main/java/com/stockroom/erp/product/CreateProductRequest.java) and [`UpdateProductRequest`](../backend/src/main/java/com/stockroom/erp/product/UpdateProductRequest.java) are explicit input DTOs. Field binding distinguishes omitted optional fields from forbidden explicit null values. Only cost accepts null. Bean Validation rejects missing/blank names and negative or unsafe money. [`JsonConfiguration`](../backend/src/main/java/com/stockroom/erp/common/JsonConfiguration.java) rejects numeric strings, fractional integer values, scalar-to-text coercion, and repeated JSON fields. The update DTO has no stock property, so a stock field is an unknown-field validation error.

[`ProductResponse.from`](../backend/src/main/java/com/stockroom/erp/product/ProductResponse.java) maps entities inside the service transaction while Open Session in View remains disabled. Controllers return response DTOs, never entities, deletedAt, or a version. [`ApiExceptionHandler`](../backend/src/main/java/com/stockroom/erp/common/ApiExceptionHandler.java) runs outside the failed service transaction and translates the named PostgreSQL indexes to `409 product_name_taken` and `409 barcode_taken`. Unexpected constraints remain internal errors. SQL and exception messages never enter the response body.

### App behavior and transitional restrictions

[`api/client.ts`](../app/src/api/client.ts) uses fetch with a 10-second timeout, structured API errors, and empty-204 support. It makes one HTTP attempt and never replays mutations. `EXPO_PUBLIC_API_URL` selects the backend, with the documented Android emulator address as the default. [`repositories/product.ts`](../app/src/repositories/product.ts) retains the existing asynchronous product function names, validates response shapes and safe integer bounds, maps cents to display values, converts null barcodes to empty strings, and calculates nullable profit. Metadata PATCH constructs an explicit body without stock.

[`useAppState`](../app/src/app/useAppState.ts) fetches the catalog on startup and keeps forms/cart in memory. Product mutations preserve form input on failure. Confirmed writes update in-memory products immediately. A revision guard prevents an earlier read from overwriting a confirmed write, and a subsequent refresh fetches committed state. A failed refresh reports that the write succeeded and retains the displayed catalog. The header offers an explicit catalog refresh for checking uncertain product outcomes. No product write is automatically resubmitted.

Registration scans only fill the form. Selling scans use the API. Only an HTTP 404 with `product_missing` offers registration; network, timeout, and malformed-response failures remain lookup errors. A synchronous ref accepts one scan per scanner opening, and closing the scanner invalidates pending callbacks. The product form blocks repeat submission and editing while saving. Existing form structure, category suggestions, safe areas, keyboard handling, and scanner component remain in place. New labels/errors have typed Portuguese and English translations.

The app no longer imports SQLite repositories or starts a sync worker. Stock controls and checkout are disabled, and action handlers also block unmigrated writes. Replenishment attempts show the translated availability message. Sales/history lists are empty until their API slices are implemented. The existing local database/sync files and native plugins remain isolated pending step 7 removal. No recovery marker storage is needed for product CRUD; adjustment and checkout markers belong to their later steps.

### Automated verification

- `make app-typecheck` passed.
- `make app-test` passed 9 tests covering product mapping and request bodies, exact barcode encoding, true lookup misses versus network/server errors, POST timeout without replay, timeout during response-body reads, empty 204 handling, malformed responses and numeric bounds, and the app import graph excluding SQLite repositories/sync workers.
- `make app-config` passed. No dependencies or Expo/native plugins changed.
- `make backend-test` passed 11 unit/HTTP tests, including strict JSON validation and metadata stock rejection.
- `make db-test-up` passed after the user started Docker. The isolated `stockroom-online-db-test-1` PostgreSQL 18.6 container and separate persistent test volume were created. The earlier local PostgreSQL fallback was initialized in `/tmp` but was not started or used.
- `make backend-integration-test` passed 17 tests against Docker PostgreSQL at port 55433. This includes the 10 foundation checks and 7 product integration tests. Product coverage includes normalization/defaults, opening stock without history, deterministic ordering, exact barcode lookup, hidden-product behavior, uniqueness reservations, concurrent duplicate creates with one winner, failed-edit rollback, metadata/deletion waiting behind an inventory writer without losing stock, and lock timeout translation. The concurrency fixtures use separate real transactions and observe PostgreSQL lock waits. These tests do not claim coverage of the unimplemented checkout/adjustment services.
- A real HTTP smoke test passed using the app's compiled product repository and the packaged API on temporary port 18081 against the isolated test database. It created, listed, scanned, edited, and hid a product and handled the empty deletion response. The temporary API process was stopped afterward. This was a Node/fetch check, not an Android/device check.
- `git diff --check` passed for the step 3 changes.
- After the Android feedback, the installed Expo CLI accepted development-build mode and Metro port 8082 without starting a server or native build. `make app-config` and `git diff --check` passed again. Makefile checks confirmed that the `.env` URL remains the default while an environment or Make command-line API URL takes precedence. The user subsequently confirmed that the revised startup works on their Android phone.

### Device verification and next work

The user reports that Android product creation, editing, and deletion work. They confirmed deletion sets `deleted_at` and removes the product from the displayed catalog. They also confirmed stock editing and sales are unavailable, as intended for this transitional build. These observations do not verify scanner behavior or restart persistence.

The user reported that `make app-start` produced a phone error, while `EXPO_PUBLIC_API_URL=http://192.168.100.121:8081 npx expo run:android --device` worked. The original start script targeted Expo Go by default because `expo-dev-client` is not installed. Metro also defaulted to the API's port 8081. The start script now explicitly selects `--dev-client --port 8082`, and Make preserves a caller-supplied API URL over `.env`. No new native package, manifest scheme, or build was added by the agent. The exact original phone error was not supplied. The user subsequently confirmed that the revised `make app-start` command works on their Android phone. The README explains opening the installed app and configuring its Metro address when needed.

Use the existing native build and the [README device checklist](../README.md#step-3-device-verification) for remaining restart, known/unknown barcode, repeated callback, keyboard/category, and disconnected read/write checks. Confirmed-write refresh failure still needs device verification. The revised Metro startup command is user-verified. The user authorized committing the current step 3 changes; no issue update was posted. Do not run a native build without immediate explicit confirmation.

After device verification, step 4 implements adjustment/history DTOs and services, request identity and recovery handling, shared inventory locks, atomic stock writes, and reason-only edits. Checkout remains disabled until its API implementation is ready.

## 2026-11-01: API contract and database foundation

Steps 1 and 2 have their starting deliverables. The copied Expo app, native source, and lockfile are under `app/`. No original backend code, migration, Git history, credential, device record, or database volume was copied. The app's SQLite and synchronization code remains pending conversion. A native Android build has not run.

The selected versions, package, local ports, and environment values are in the README. The API contract covers product actions, scanner lookup, stock adjustments, history, checkout, payment, request-ID lookups, fingerprints, error responses, and restart recovery. Only the health endpoint is implemented at this stage.

### How the Java code maps to PostgreSQL

`Product` maps a Java UUID to `products.id`, nullable `Long costCents` to `cost_cents`, primitive `long sellingPriceCents` to `selling_price_cents`, and `int stock` to the signed integer balance. Explicit column names keep Java names independent of the schema. `GenerationType.UUID` generates business IDs on the server. UTC `Instant` values map to PostgreSQL timestamptz. Opening stock lives on the product and creates no adjustment.

`Sale` stores its canonical payment string through `PaymentMethodConverter`, never an enum ordinal. It stores cash received only for cash, alongside request identity and the original fingerprint. `SaleItem` has simple lazy references to the sale and product plus independent name/price/line-total snapshots. There is no cascading delete or bidirectional collection. `StockAdjustment` stores signed quantity, nullable reason, and its own request identity. PostgreSQL constraints protect money bounds, payment rules, positive item quantities, nonzero adjustments, and historical foreign keys.

`JpaRepository` supplies ordinary persistence. `ProductRepository.findByIdForUpdate` is the shared write-lock query, deliberately including hidden rows. Future service transactions must acquire it before using mutable product state. Request-ID lookups are derived repository methods. `SaleItemRepository` loads items for a set of sales in one query. `StockAdjustmentRepository.updateReason` uses focused JPQL referring to entity properties and changes only reason; automatic flush/clear avoids stale managed state after this bulk update.

Flyway's `V1__business_schema.sql` owns constraints and indexes. ASCII folding uses `translate` under C collation; names and nonempty barcodes remain reserved after deletion. Hibernate validates mappings after Flyway runs. SQL initialization and Open Session in View are disabled. Hikari connections set 5-second lock waits and 15-second statement limits, and service transactions default to 20 seconds. READ COMMITTED is PostgreSQL's default.

`RequestFingerprints` implements the contract's normalized compact JSON and SHA-256 hash. Checkout normalization merges duplicate quantities with overflow checks, sorts canonical UUID strings, and normalizes override sets. Unit tests use independently calculated expected hashes. The helper does not execute a mutation or provide idempotency by itself; transaction services must still implement the contract's lock/recheck and unique-constraint race handling.

### DTOs and transaction boundaries

`HealthController.HealthResponse` is the implemented response DTO. Business DTOs are specified in the contract and will be implemented with their feature controllers/services. Entities never leave controllers. No product, adjustment, or checkout write endpoint is exposed yet.

The database tests use Spring transactions for isolated persistence checks and separate committed transactions for a second application startup. They also prove a deliberately wrong mapping fails validation without changing the stock column. This validates the database foundation. It does not prove inventory concurrency or full checkout atomicity, because those services are not implemented yet.

### Automated verification

- Copied app dependencies installed with `npm ci` from the copied lockfile.
- `make app-typecheck` passed.
- `make app-config` passed, preserving VisionCamera and the current temporary SQLite/background plugins.
- `docker compose config --quiet` passed. Compose containers were not started.
- `make backend-test` passed 6 unit/HTTP tests.
- `make backend-integration-test` passed 10 tests against isolated PostgreSQL 18.6 at port 55433 with Flyway and Hibernate validation enabled. Coverage includes all four entity mappings, opening stock with no history entry, ASCII and barcode uniqueness including soft deletion, payment/money/quantity/foreign-key constraints, per-operation request-ID uniqueness, reason-only updates, second application startup persistence, and deliberately incompatible mapping rejection.
- A real HTTP smoke check passed at `http://localhost:8081/healthz` after application startup; the API process was then stopped.
- The database used a fresh temporary local PostgreSQL cluster for this run, separate from every existing database. The Compose definition provides independent persistent development/test volumes for normal use.

### Device verification

Pending. No UI or scanner behavior was device-tested. The copied app remains the old local-first app until steps 3 through 7 finish. No commit or issue update was created.

### Next implementation slice

Step 3 implements product DTOs, services, validation, constraint-error translation, controllers, and API-backed app repositories. Product writes must share the inventory lock. Scanner failures must distinguish network errors from real misses. Transitional UI must disable stock/sale writes until those paths also use the API. Later slices implement adjustment and checkout transactions, concurrency tests, recovery markers, loading/error behavior, and offline-code removal.
