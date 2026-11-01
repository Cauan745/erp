# Stockroom online-first rebuild

This repository starts the rebuild described in [the plan](docs/online-first-rebuild-plan.md). The [API contract](docs/api-contract.md) defines the target business endpoints.

## Selected setup

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

Spring Boot manages Hibernate and Flyway dependency versions. [Spring system requirements](https://docs.spring.io/spring-boot/system-requirements.html) support Java 21. PostgreSQL 18 is [supported until November 2030](https://www.postgresql.org/support/versioning/). The Maven Wrapper pins Maven independently of a system installation.

## Current status

Steps 1–2 are verified. Step 3 implements product listing, exact barcode lookup, creation, metadata editing, and soft deletion through `/api/v1/products`. The app catalog now uses the API. The user verified product creation, editing, and soft deletion on Android. Stock adjustments, reason edits, and checkout are disabled until their API paths are implemented. The cart and forms remain in memory. Sales and stock history are empty in this transitional build. SQLite/sync files and native plugins remain pending removal in step 7, but the app does not import their repositories or start a worker. No historical database or device data is imported. Scanner, restart, and failure-path device checks remain pending.

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

Compose reads root `.env` automatically for variable substitution. Spring does not read that file automatically. The Makefile explicitly exports its values to Spring and Expo. Direct wrapper invocations require environment exports or use Spring's documented defaults from `application.yml`. Expo reads `EXPO_PUBLIC_API_URL` from the environment supplied by Make or an app-specific `.env.local`. Never put credentials in an Expo public variable.

Development PostgreSQL has its own named Compose volume. The integration-test service has a different volume, database, and port. Neither service attaches the original project's volume. Startup applies Flyway migrations and then validates JPA mappings. Hibernate never creates schema. Normal commands do not reset data.

A physical phone needs a reachable host IP, for example `EXPO_PUBLIC_API_URL=http://192.168.1.20:8081 make app-start`. With USB debugging, `adb reverse tcp:8081 tcp:8081` permits `http://localhost:8081` on the phone. The API client uses `EXPO_PUBLIC_API_URL`, defaulting to the Android emulator URL `http://10.0.2.2:8081`. Restart Metro after changing that value.

`make app-start` starts Metro on port 8082 and explicitly targets the installed native development build. This avoids the API's port 8081 and Expo Go, which cannot load VisionCamera. Open the installed Stockroom app. The current Android manifest has no development URL scheme, so a QR link may not launch it. If the installed build looks for another Metro address, set its developer-menu server address to the computer's LAN IP and port 8082. With USB, `adb reverse tcp:8082 tcp:8082` also forwards Metro; it is separate from the API forwarding above. An explicit `EXPO_PUBLIC_API_URL` supplied when invoking Make takes precedence over `.env`.

The user's Android product checks succeeded with `EXPO_PUBLIC_API_URL=http://192.168.100.121:8081 npx expo run:android --device` from `app/`. That command compiles and installs native code. Routine JavaScript changes can use the installed build and `make app-start`. The user confirmed that the revised `make app-start` command works on their Android phone. See [Expo's launch-target documentation](https://docs.expo.dev/more/expo-cli/#launch-target).

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

`backend-test` runs unit/HTTP tests without PostgreSQL. `backend-integration-test` runs real PostgreSQL tests with Flyway and Hibernate validation; it must fail if the isolated test database is unavailable. Do not point it at the development database. The test command sets `TEST_DATABASE_URL`, `TEST_DATABASE_USERNAME`, and `TEST_DATABASE_PASSWORD`. See [implementation progress](docs/implementation-progress.md) for actual results and remaining work. Device behavior requires separate manual verification.

## Step 3 device verification

Start the development database with `make db-up`, the API with `make backend-run`, and Metro with the device's reachable `EXPO_PUBLIC_API_URL` and `make app-start`. Open the existing native development build. These commands do not build Android.

Create a product with opening stock, restart the app, find it by barcode, edit its metadata, and hide it. Confirm category suggestions, form scrolling with the keyboard, and scanner permissions. Scan once and confirm repeated camera callbacks add only one cart item. An unknown barcode should offer registration; a disconnected API should show a lookup error. A failed product save must keep the form, and a failed refresh must retain the catalog. The refresh button lets you check uncertain product-write outcomes without automatically resubmitting them. Stock adjustment controls and checkout are disabled during this step.

Device verification is required before committing the step 3 UI changes or posting issue updates. Automated results and the code handoff are in [implementation progress](docs/implementation-progress.md).
