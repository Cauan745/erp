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
| Development PostgreSQL port/database | 55432 / `stockroom` |
| Test PostgreSQL port/database | 55433 / `stockroom_test` |
| Compose project | `stockroom-online` |
| Database user/password | `stockroom` / `stockroom_dev` for local development only |
| Android emulator API URL | `http://10.0.2.2:8081` |
| Desktop API URL | `http://localhost:8081` |

Spring Boot manages Hibernate and Flyway dependency versions. [Spring system requirements](https://docs.spring.io/spring-boot/system-requirements.html) support Java 21. PostgreSQL 18 is [supported until November 2030](https://www.postgresql.org/support/versioning/). The Maven Wrapper pins Maven independently of a system installation.

## Current status

The API contract and backend database foundation are the first implementation slice. Only `/healthz` is exposed initially. Products, inventory, and checkout controllers are the next work. The copied Expo app still uses its original local SQLite/sync architecture and is not the online-first MVP yet. Do not connect part of its business flow to the API while leaving other writes local. No historical database or device data is imported.

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

A physical phone needs a reachable host IP, for example `EXPO_PUBLIC_API_URL=http://192.168.1.20:8081 make app-start`. With USB debugging, `adb reverse tcp:8081 tcp:8081` permits `http://localhost:8081` on the phone. These are the target API settings; the copied app's old fallback stays unchanged until its API client is implemented.

VisionCamera requires a native development build. Starting Expo only starts Metro. Native Android builds have frozen this host. Get explicit confirmation immediately before `expo run:android`, `./gradlew`, or any command that invokes them. The copied native source is retained; credentials, debug keystores, local properties, dependencies, caches, and build outputs are excluded. Android tooling can generate a local debug keystore when a native build is later authorized.

## Checks

```sh
make app-typecheck
make app-config
make backend-test
make db-test-up
make backend-integration-test
```

`backend-test` runs unit/HTTP tests without PostgreSQL. `backend-integration-test` runs real PostgreSQL tests with Flyway and Hibernate validation; it must fail if the isolated test database is unavailable. Do not point it at the development database. The test command sets `TEST_DATABASE_URL`, `TEST_DATABASE_USERNAME`, and `TEST_DATABASE_PASSWORD`. See [implementation progress](docs/implementation-progress.md) for actual results and remaining work. Device behavior requires separate manual verification.
