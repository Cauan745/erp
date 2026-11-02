# Stockroom

Stockroom is an online-first inventory and checkout app built with Expo, Spring Boot, and PostgreSQL. It manages products, barcode scans, stock adjustments, sales, and inventory history through the API. Forms and the cart stay in memory; only unresolved request-recovery markers persist on the device.

The app is an unreleased beta with no existing users to migrate. Development supports the current version only.

The MVP was accepted after final device testing on 2026-11-02 and committed as `eb16296`. See the [API contract](docs/api-contract.md) and [device regression checklist](docs/device-regression-checklist.md).

## Setup

| Setting | Value |
| --- | --- |
| Spring Boot | 4.1.2 |
| JDK | 21 LTS |
| PostgreSQL | 18.6, image `postgres:18.6` |
| Java package | `com.stockroom.erp` |
| API port | 8081 |
| Metro port | 8082 |
| Development PostgreSQL port/database | 55432 / `stockroom` |
| Test PostgreSQL port/database | 55433 / `stockroom_test` |
| Compose project | `stockroom-online` |
| Database user/password | `stockroom` / `stockroom_dev` for local development only |
| Android emulator API URL | `http://10.0.2.2:8081` |
| Desktop API URL | `http://localhost:8081` |

## Development

Install JDK 21, Node/npm, and Docker with Compose. From this repository:

```sh
cp .env.example .env
make app-install
make db-up
make backend-run
# In another terminal
curl http://localhost:8081/healthz
make app-start
```

Compose reads root `.env` automatically for variable substitution. Spring does not read that file automatically. The Makefile includes shell-compatible root `.env` entries and exports them to its commands, including Spring and Expo. Direct wrapper invocations require environment exports or use Spring's documented defaults from `application.yml`. Direct Expo invocations from `app/` read their process environment and app-specific `.env` files, not the repository's root `.env`. Keep the API setting named `EXPO_PUBLIC_API_URL`; it is embedded in the JavaScript bundle. Never put credentials in an Expo public variable. Export the same reachable URL explicitly for an authorized native build or a standalone export.

Development PostgreSQL has its own named Compose volume. The integration-test service has a different volume, database, and port. Neither service attaches the original project's volume. Startup applies Flyway migrations and then validates JPA mappings. Hibernate never creates schema. Normal commands do not reset data.

A physical phone needs a reachable host IP, for example `EXPO_PUBLIC_API_URL=http://192.168.1.20:8081 make app-start`. With USB debugging, `adb reverse tcp:8081 tcp:8081` permits `http://localhost:8081` on the phone. The API client uses `EXPO_PUBLIC_API_URL`, defaulting to the Android emulator URL `http://10.0.2.2:8081`. Restart Metro after changing that value.

`make app-start` starts Metro on port 8082 and explicitly targets the installed native development build. This avoids the API's port 8081 and Expo Go, which cannot load VisionCamera. Open the installed Stockroom app. The current Android manifest has no development URL scheme, so a QR link may not launch it. If the installed build looks for another Metro address, set its developer-menu server address to the computer's LAN IP and port 8082. With USB, `adb reverse tcp:8082 tcp:8082` also forwards Metro; it is separate from the API forwarding above. An explicit `EXPO_PUBLIC_API_URL` supplied when invoking Make takes precedence over `.env`.

VisionCamera requires a native development build. Starting Expo only starts Metro. Native Android builds have frozen this host. Get explicit confirmation immediately before `expo run:android`, `./gradlew`, or any command that invokes them. The copied native source is retained; credentials, debug keystores, local properties, dependencies, caches, and build outputs are excluded. Android tooling can generate a local debug keystore when a native build is later authorized.

## Checks

```sh
make app-typecheck
make app-test
make app-config
make backend-test
make db-test-up
make backend-integration-test
```

`backend-test` runs unit/HTTP tests without PostgreSQL. `backend-integration-test` runs real PostgreSQL tests with Flyway and Hibernate validation; it must fail if the isolated test database is unavailable. Do not point it at the development database. The test command sets `TEST_DATABASE_URL`, `TEST_DATABASE_USERNAME`, and `TEST_DATABASE_PASSWORD`. Device behavior requires separate manual verification.

## Verification status

Current app checks pass typecheck, Expo config, and 53 tests with no failures or skips. Five obsolete upgrade-only tests were removed with their compatibility implementation. This JavaScript cleanup has not been checked on the device yet.

The backend was last verified at the accepted baseline `eb16296`: 16 unit/HTTP tests and 45 real PostgreSQL integration tests passed with no failures or skips. The isolated PostgreSQL service was reused without resetting data. Backend code is unchanged by this cleanup. App tests use native/storage/fetch doubles; the user's baseline device acceptance was an overall report without per-scenario timing traces.

Read-only inspection of the moto g22's installed APK confirmed the removed Expo SQLite/background modules were absent and AsyncStorage and VisionCamera remained. iOS behavior was not independently verified.

## Native updates

Install updates over the existing app with the same package ID and signing identity. Preserve device data and recovery markers. Never uninstall or clear storage to resolve a signing or native-dependency problem. Keep the tracked Android customizations instead of regenerating the project.

`make run` inside `app/` delegates to the root `app-start` target and starts Metro. Native builds require a separate command and immediate explicit confirmation before an agent runs it.

## Project references

- [API contract](docs/api-contract.md) for requests, responses, validation, and recovery.
- [Device regression checklist](docs/device-regression-checklist.md) for future UI and network checks.
- [Agent instructions](AGENTS.md) for maintenance rules.

Completed rebuild plans, milestone handoffs, and acceptance details remain available in Git history at `eb16296`.
