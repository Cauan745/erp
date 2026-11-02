# Agent instructions

## Purpose

Maintain the completed online-first Stockroom MVP. Current setup and verification results are in `README.md`; business rules and DTOs are in `docs/api-contract.md`. Preserve the Expo app's screens and business behavior. Products, stock, checkout, and history use the API. The copied SQLite repositories and synchronization architecture have been removed; do not restore them or mix API writes with local business writes.

This is an unreleased beta with no users to migrate. Support the current version only. Do not add compatibility bridges, legacy task cleanup, or old-version migration paths unless explicitly requested.

PostgreSQL is the target source of truth. UI writes explicitly call the API. Never add offline business storage, a queue, synchronization, automatic mutation replay, authentication, or object recognition.

## Backend

Use Java 21 and Spring Boot with MVC, Bean Validation, JPA/Hibernate, Flyway, and PostgreSQL. Java package is `com.stockroom.erp`. Organize controllers, concrete services, entities, repositories, and DTOs by feature. Do not add generic repository wrappers or service interfaces without a concrete need.

Use JpaRepository for ordinary persistence. Controllers accept/return explicit DTOs, never entities. Map DTOs inside service transactions with open-in-view disabled. Flyway owns all schema changes; Hibernate must use ddl-auto=validate and SQL initialization must stay disabled. Native SQL is allowed for justified queries such as combined inventory history; use the same datasource/transaction and account for persistence-context state.

All product writers acquire the shared PESSIMISTIC_WRITE lock before reading/modifying a product, including metadata edits and soft deletion. Lock multiple products one by one in sorted canonical UUID order under READ COMMITTED. Keep locks and transactions bounded. Sale, item, and stock writes are atomic. Preserve snapshots and independent line totals. Opening stock creates no adjustment/history row.

Store integer cents and enforce JavaScript safe-integer bounds. Payment methods are cash, debit_card, credit_card, pix. Soft deletion preserves history, names, and barcode reservations. Product names use ASCII-only case folding; barcodes use exact nonempty uniqueness.

Request IDs and normalized fingerprints are unique on sale/adjustment business rows. Check before mutable validation and again after lock waits. Catch duplicate-ID constraints outside the failed transaction and compare the committed winner in a fresh transaction. Preserve the original fingerprint after reason edits. Reason edits update only reason.

## App and recovery

Keep existing screen layouts, scanner, safe areas, and keyboard handling. Put API HTTP code under app/src/api and mapping repositories under app/src/repositories. Keep the cart/forms in memory. Persist only minimal unresolved request-recovery markers using AsyncStorage, never request payloads. Await marker persistence before a POST. Check previous requests by ID against their recorded backend. A lookup 404 is unresolved and never triggers replay or a replacement ID. Clear a marker only after confirmation, a definitive rejection after rollback, or explicit manual reconciliation. Preserve all outstanding markers.

Use typed i18n, pt-BR by default and English fallback, for all user-facing labels, errors, permission text, and connection messages. Internal codes and product data stay untranslated. Format BRL and dates for the locale. Failed requests preserve input and old fetched data. A failed refresh after a confirmed write must not turn that write into a reported failure.

Keep business types in app/src/types.ts, the replenishment reason constant in app/src/constants.ts, and the online request UUID helper in app/src/api/ids.ts. Preserve all device data and recovery markers; never uninstall or clear storage to remove native dependencies. Preserve intentional tracked Android customizations rather than regenerating the native project.

## Checks and handoff

Run make app-typecheck and make app-test after TypeScript changes, make backend-test after Java changes, and make app-config after Expo/plugin changes. Run make db-test-up and make backend-integration-test for actual PostgreSQL coverage. Audit runtime imports, lockfiles, Expo configuration, and native autolinking after dependency removal. Report unavailable integration/device coverage explicitly. JavaScript checks on an existing development build do not verify native dependency removal. Do not use an in-memory database as proof of PostgreSQL constraints or locks.

Explain each implemented feature's entity mappings, repository queries, DTO mapping, and transaction using its code in the handoff. Report actual check results and verification limits in the handoff. Update the README verification baseline when reverified. Completed rebuild plans and handoffs are available in Git history at `eb16296`; do not recreate an archive directory for them.

Native Android builds have frozen/crashed the host. Ask for explicit confirmation immediately before running ./gradlew, expo run:android, or any wrapper that invokes them. Starting Expo alone is safe and does not build native code. VisionCamera cannot run in Expo Go. After UI checks, pause for the user's device verification before committing UI changes or posting issue updates. Do not create commits unless requested.
