# Stockroom online-first rebuild

Stockroom uses an Expo app and a Spring Boot API with PostgreSQL as the source of truth. [The plan](docs/online-first-rebuild-plan.md) describes the rebuild, and the [API contract](docs/api-contract.md) defines its business endpoints.

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

Steps 1–6 are implemented. The user accepted step 6 after device verification. Catalog, sales, and inventory history load independently, keep previous rows after failed refreshes, and offer separate refresh/retry actions. Returning to the foreground refreshes lists and recovery reminders. Checkout and sales history use the API, including payment validation, explicit shortage overrides, price review, saved item snapshots, and request recovery. PostgreSQL transactions and shared product locks protect inventory writes. The app persists only unresolved request markers, never business data or request bodies. Android startup and product CRUD are user-verified. Step 4 received partial device testing and user acceptance; individual untested flows remain unverified. The user completed step 5 device testing and reported that everything works as expected.

Step 7 removes the copied SQLite/sync code and its dependencies/plugins. Its automated results are recorded in [implementation progress](docs/implementation-progress.md). The user accepted the app behavior after device testing with "Everything seems to be fine." The user also reported a probable rebuild. Actual task cancellation and removal of native modules from the installed artifact remain unverified. See the [upgrade sequence](#step-7-upgrade-and-device-verification) before replacing an older build. Existing device data is preserved and never imported into PostgreSQL. Step 8's final MVP acceptance remains separate.

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

Create a product with opening stock, restart the app, find it by barcode, edit its metadata, and hide it. Confirm category suggestions, form scrolling with the keyboard, and scanner permissions. Scan once and confirm repeated camera callbacks add only one cart item. An unknown barcode should offer registration; a disconnected API should show a lookup error. A failed product save must keep the form, and a failed refresh must retain the catalog. The refresh button lets you check uncertain product-write outcomes without automatically resubmitting them. Stock adjustments and checkout are now enabled through the API.

Device verification is required before committing the step 3 UI changes or posting issue updates. Automated results and the code handoff are in [implementation progress](docs/implementation-progress.md).


## Step 4 device verification

Step 4 adds `@react-native-async-storage/async-storage` 2.2.0 for recovery markers. An installed Android build without that native module needs a new native build before adjustments can work. Metro reload alone cannot install it. The app loads marker storage on demand so an older build can still open the catalog; storage errors block new adjustment POSTs. No native build was run by the agent. Get explicit confirmation immediately before any agent-run Android build, as required by [AGENTS.md](AGENTS.md).

For the first step 4 installation, stop the existing Metro process, then run this from the repository root when ready to build Android:

```sh
cd app
EXPO_PUBLIC_API_URL=http://192.168.100.121:8081 npx expo run:android --device --port 8082
```

Use your own reachable API address if different. This command compiles and installs native code with AsyncStorage. Install over the existing app to preserve recovery markers. After this installation, routine JavaScript updates can use `make app-start` from the repository root again. Before rebuilding, older installations show a translated message requesting a native build and block stock adjustments.

With a native build containing AsyncStorage, start the API and Metro as above. Verify these flows on the phone:

- Create a product with stock 10. Its opening balance must not appear in history. Apply +2, then -3, and confirm stock 9 with exactly two history rows. Restart and confirm the saved stock and history reload.
- Edit an adjustment's reason, including clearing it. Confirm stock, quantity, and original timestamp stay unchanged. Hide the product and confirm its adjustment history remains editable.
- From a cart shortage, choose to add stock. Confirm the adjustment is saved with the translated automatic reason. Open its reason editor and save without changing the displayed value. The database must retain `sale-shortage-replenishment`. Checkout now uses the API as described below.
- Disconnect before saving an adjustment. The form must retain its values. An uncertain submission leaves a reminder and blocks another adjustment until lookup confirms it or you reconcile it manually. Restart and use "Verificar solicitação anterior". Repeated lookup must never send another POST. A `request_not_found` response keeps the reminder.
- If the configured API URL changes, the reminder must still show and query its recorded backend. Confirmation displays the saved adjustment. The catalog/history refresh uses the currently configured backend. Reconcile only after checking the original server's stock and history. Dismissing the reminder does not cancel an in-flight request.
- Disconnect during history refresh. Keep the catalog and previous history visible, with a history retry action. After a confirmed adjustment or reason edit, a failed refresh must say the change was saved and must not invite resubmission as a failed write.
- Check keyboard scrolling, Android back handling, and repeated save taps in both stock modals. Saving disables editing and dismissal while the request is in flight.

The backend tests cover concurrency and rollback separately on PostgreSQL. Lost-response timing, native storage, keyboard behavior, and the complete phone recovery flow still need device verification. No commit or issue update should precede that verification.


## Step 5 device verification

Use the existing native development build containing AsyncStorage, then start PostgreSQL, the API, and Metro using the development instructions above. Step 5 adds no native dependency or plugin. The agent has not run an Android native build. The user completed device testing and reported that everything works as expected, then requested committing step 5. No issue update has been made. The checklist below remains available for regression checks.

- Build and edit a cart using product buttons and the scanner. Confirm quantities and totals, keyboard scrolling, safe areas, and Android back behavior retain their existing presentation.
- Complete separate sales with cash, debit card, credit card, and Pix. Cash must cover the total and show the correct change. Noncash must save no cash amount. Tap confirm repeatedly and attempt to go back while saving. Only one sale should appear, with one stock decrement.
- Open the sales tab and each sale's details. Check names, quantities, saved prices, line totals, payment, cash, and change. Edit or hide a sold product, restart the app/API, and confirm the historical sale retains its snapshots. The inventory history should show negative sale quantities with read-only reasons.
- Change a cart product's price on the server before confirming payment. The app must update the cart estimate, preserve the chosen payment and entered cash, and require another explicit confirmation. The first attempt must create no sale or stock change.
- Reduce stock on the server after building a cart. Check cancel, adding stock, and selling anyway. With several shortages, each override must require explicit approval and earlier approvals must remain in the request. Adding stock commits a separate adjustment with the automatic internal reason. It remains saved if the later checkout fails or is cancelled.
- Disconnect during checkout. The cart and payment inputs must stay visible. An uncertain checkout must leave a reminder, prevent replacement checkout requests, and preserve the submitted cart until lookup confirms it or you explicitly reconcile. A lookup miss must stay unresolved. After a restart, only the marker remains, with no stored cart or request body to replay.
- Use the reminder to check the recorded backend. A committed result must open sale details and refresh lists. If the API URL changed, lookup must still use the original server and must not add its sale to the new server's sales list or clear an unrelated new cart. Dismissing after checking server history does not cancel a request in progress.
- Fail a sales-list refresh and confirm the last fetched sales remain visible with a retry action. Fail a refresh after a confirmed checkout and confirm the app still shows the saved sale and does not report checkout failure.

Automated tests cover PostgreSQL constraints, concurrency, rollback, and application recovery logic. Native storage persistence, modal rendering, the scanner, keyboard behavior, and phone network timing require device testing. The user has accepted step 5 after device testing. Commits and issue updates still require a request.

## Step 6 device verification

Use the installed native build containing AsyncStorage and `make app-start` with the reachable `EXPO_PUBLIC_API_URL` described above. Step 6 changes JavaScript only. Metro and the API still use separate ports, 8082 and 8081. No native build is needed for these changes. The header's "Catálogo online" describes how the app stores data; it is not a live connection indicator. Successful recovery on a recorded server confirms only that earlier operation.

- Start with the API unavailable. Navigation and recovery reminders must remain accessible, and catalog, sales, and inventory history must each show their own loading/error state. Restore the API and retry each list. A list error must not hide another list or the cart.
- Load all lists, then disconnect and refresh. Keep the previous products, sales, and history visible. Retry one list and confirm the others keep their data/errors. The header refresh requests all lists. Repeated refresh taps must not start overlapping reads for the same list.
- Background the app, change data through another client, and return. Refresh the affected lists without changing an unfinished product/stock form, cart, payment method, or entered cash. Return while a refresh is still pending and confirm a later fetch gets the latest data.
- Scan known and unknown barcodes. Repeated camera callbacks must add once. A failed lookup must show its own retry action, keep the cart/catalog, and never offer unknown-product registration. Close/reopen the scanner and confirm old results do not change the new scan. Check scanner permissions and registration scans as regressions.
- Tap product save/delete, adjustment save, reason save, and checkout confirmation repeatedly. Each submitted action must run once while pending. Product and stock forms must retain input on rejection or a lost response. A submitted checkout must retain and lock its contents and payment inputs. Check Android back, safe areas, and keyboard scrolling.
- After a successful write, interrupt a following refresh. The app must confirm the write and report the refresh error separately. Retry the affected list without submitting the write again. Metadata edits should also refresh product names in adjustment history; saved sale names remain unchanged.
- For an uncertain adjustment or checkout, confirm the reminder survives restart and every lookup uses its recorded backend. A lookup 404 stays unresolved, with no replay or replacement POST. New adjustments/checkouts stay blocked while reminders or a marker-storage error remain. Confirming or dismissing an unrelated reminder must not unlock an uncertain checkout's cart. A reminder from a different backend must not clear a current form/cart or change current-backend lists.

The user confirmed step 6 device verification with "Verified" and explicitly requested committing it. No separate per-flow results were supplied. The checklist remains available for regression checks. Step 6 is committed as `2813016`. No issue update was requested.

## Step 7 upgrade and device verification

Use two passes. Running new JavaScript on the installed development build checks app behavior and removes any legacy task registration. Only an updated native installation can prove that SQLite and the background-task modules have left the binary. Do not uninstall, clear application storage, remove database files, reset AsyncStorage, or delete database volumes.

1. Keep the existing installed build containing AsyncStorage and the legacy native modules. Start the API and Metro with the phone's reachable `EXPO_PUBLIC_API_URL` using `make app-start`. Reload this step's JavaScript before replacing the native installation. At startup, `legacyTaskCleanup.ts` uses Expo's optional native-module lookup to check for `stockroom-background-sync` and unregister that name only. The native task consumer cancels its worker. The cleanup checks that the registration is gone. It never reads SQLite or imports the removed packages, defines a task, registers work, or sends a business request.
2. If cleanup fails, a translated message below the header offers a manual retry. Resolve it on the existing build before replacing the installation. Startup performs one attempt, with no timer or foreground retry. Lists, forms, and recovery lookups remain usable. On a build without the old native module, cleanup is a no-op; absence of an error on that build is not proof that a previous registration was removed. For an installation that may have registered legacy work, use the existing build for this cleanup pass first. A direct binary upgrade that skips this pass has not been verified.
3. On the existing build, check catalog, sales, inventory history, refresh, a product save, a stock adjustment, checkout, and known/unknown barcode scans. Check safe areas, Android back, keyboard scrolling, Portuguese labels, and BRL/date formatting. If unresolved reminders exist, confirm every reminder survives reload and still looks up its recorded backend. A 404 must remain unresolved without a POST or replacement ID. Do not create a replacement submission or dismiss a reminder merely to test the upgrade.
4. After device feedback, a new native build still requires explicit confirmation immediately before the agent runs any Android build command. Preserve the existing package ID and signing identity, and install over the app. Never use an uninstall/reinstall workaround if signatures do not match. Keep the tracked Android project, VisionCamera configuration, resize behavior, cleartext development connectivity, and native customizations. Do not run a clean prebuild to regenerate them.
5. On the rebuilt installation, repeat the app checks and confirm existing markers still load. Inspect the resulting APK/module list and Android scheduled jobs to verify the old SQLite/background modules and task registrations are absent. Source/config/autolinking checks and Metro reload alone cannot establish that. Legacy SQLite files and task metadata can remain inert on disk; this change does not open, migrate, transmit, or delete them. Verify that no legacy worker runs after backgrounding and restarting the app. Record this result separately from checks on the previous development build.

The tracked Android manifests, application/activity code, Gradle files, and ProGuard rules contain no explicit legacy task or SQLite registrations. Native modules were autolinked from dependencies. There is no tracked iOS project to clean; Expo configuration no longer requests background processing or scheduler identifiers for a future iOS build. iOS installation and upgrade behavior remain unverified.

The existing Makefile already provides install/start, app checks, backend tests, and separate PostgreSQL integration commands. Its normal startup targets neither reset data nor compile Android. Existing root and Android `.gitignore` rules cover dependencies, Expo caches, native outputs, Maven outputs, and machine-specific secrets, so no setup recreation is needed. A backend Dockerfile is unnecessary while Spring runs locally with Compose PostgreSQL.

The user accepted the observed app behavior after device testing and reported, "I rebuilt it, i am pretty sure". No per-flow, installed-module, or scheduled-job inspection results were supplied. Identify and inspect the installed artifact before deciding whether another rebuild is needed; native task cancellation and dependency removal remain unverified. The user subsequently requested committing step 7. No native build or issue update was requested. The full end-to-end MVP acceptance in step 8 remains outstanding.
