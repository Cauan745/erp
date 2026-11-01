# Implementation progress

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
