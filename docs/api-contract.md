# Online-first API contract

This is the implemented contract for `/api/v1`. Acceptance and verification results are recorded in the [README](../README.md#verification-status). JSON uses camelCase, UUID strings, UTC ISO-8601 timestamps, and integer cents. Never serialize JPA entities. Empty collections return `[]`. Authentication, synchronization, pagination, and offline writes are outside this MVP.

## Values and normalization

Money is an integer from 0 through 9007199254740991, JavaScript's maximum safe integer. Validate calculated line totals, totals, and change against that bound too. Stock and signed adjustments use PostgreSQL/Java signed 32-bit integers. Check arithmetic before storing; adjustment quantity cannot be zero, sale quantity must be positive. Reject fractions and numeric strings instead of truncating or coercing them. JSON null is allowed only for fields explicitly described as nullable. Unknown fields are rejected.

Trim names, categories, barcodes, and reasons using Java `String.trim()`. A product name is required. An omitted or blank category becomes the internal value `General`. Blank or omitted barcode and reason become null. Cost may be null; selling price is required and nonnegative. Omitted opening stock defaults to 0; a negative opening balance is permitted. Product-name uniqueness folds only ASCII A-Z to a-z using PostgreSQL `translate`, with C collation. It does not fold accented letters. Names and nonempty exact barcodes stay reserved even after soft deletion. A null barcode is unlimited.

`paymentMethod` is exactly `cash`, `debit_card`, `credit_card`, or `pix`. Cash requires integer `cashReceivedCents` covering the authoritative total. Noncash accepts only absent/null cash and stores null. Change is derived, never a payment column.

## Response DTOs

```ts
type Product = {
  id: string; name: string; barcode: string | null; category: string;
  costCents: number | null; sellingPriceCents: number; stock: number;
  createdAt: string; updatedAt: string;
};
type Adjustment = {
  id: string; requestId: string; productId: string; quantity: number;
  reason: string | null; createdAt: string;
};
type SaleItem = {
  id: string; productId: string; lineNumber: number; productName: string;
  quantity: number; unitPriceCents: number; lineTotalCents: number;
};
type Sale = {
  id: string; requestId: string; totalCents: number;
  paymentMethod: 'cash' | 'debit_card' | 'credit_card' | 'pix';
  cashReceivedCents: number | null; changeCents: number | null;
  createdAt: string; items: SaleItem[];
};
type HistoryEntry = {
  id: string; productId: string; productName: string; quantity: number;
  reason: string | null; source: 'sale' | 'adjustment'; createdAt: string;
};
```

Client repositories map cents to existing decimal display fields at their boundary. Map null barcodes to the app's empty string, `items` to sale `lines`, and compute profit from selling price minus nullable cost. Do not expose entity associations, deletedAt, versions, or fingerprints.

## Product endpoints

| Method/route | Request | Success |
| --- | --- | --- |
| `GET /healthz` | None | 200 `{ "status": "ok" }`, process liveness only |
| `GET /api/v1/products` | None | 200 `Product[]`, active only |
| `GET /api/v1/products/by-barcode?barcode=...` | Exact barcode after trimming; blank is invalid | 200 `Product`, or 404 `product_missing` |
| `POST /api/v1/products` | `{name, barcode?, category?, costCents?, sellingPriceCents, stock?}` | 201 `Product` |
| `PATCH /api/v1/products/{id}` | Complete metadata `{name, barcode?, category?, costCents?, sellingPriceCents}` | 200 `Product`; stock is forbidden |
| `DELETE /api/v1/products/{id}` | None | 204 empty body; marks deletedAt |

Metadata PATCH replaces the permitted metadata fields. Omitted optional barcode/cost clear them; omitted category uses `General`. Writes to a missing/deleted product return `product_missing`. Repeated deletion of an already hidden row returns 204; an unknown ID returns 404. Lists sort by createdAt descending, ASCII-folded name ascending, then ID. Products keep signed stock. Opening stock creates no history row, including zero and negative balances. Stock 10 with no activity has empty history; later +2 yields stock 12 with one +2 entry.

Metadata writes and deletion take the same product row write lock used by inventory changes. Updates change only permitted managed fields. No version or optimistic-conflict API is introduced.

## Stock endpoints

| Method/route | Request | Success |
| --- | --- | --- |
| `POST /api/v1/products/{id}/stock` | `{requestId, quantity, reason?}` | 201 `Adjustment` for first commit; 200 on identical retry |
| `GET /api/v1/stock/adjustments/by-request-id/{requestId}` | None | 200 `Adjustment`, or 404 `request_not_found` |
| `GET /api/v1/stock/history?limit=50` | Positive integer limit, default 50, maximum 1000 | 200 `HistoryEntry[]` |
| `PATCH /api/v1/stock/adjustments/{id}` | `{reason: string | null}` required | 200 `Adjustment` |

An adjustment atomically updates stock and inserts its row. Missing/deleted products reject new adjustments. Reason edits remain allowed after product deletion, change only the reason column, and preserve quantity, stock, timestamp, requestId, and fingerprint. Unknown adjustment returns 404 `adjustment_missing`.

History merges adjustments with sale items, newest first, then source and ID as stable ties. Sale quantities are negative and names use item snapshots. Adjustment names use the current referenced product name, including hidden products. Sale history uses internal reason `Sale`; the UI translates by source. `sale-shortage-replenishment` remains an internal adjustment reason and is translated only for display. Unchanged reason edits preserve that code. Only source `adjustment` permits reason editing. No synthetic opening-stock entries exist.

## Sales endpoints

| Method/route | Request | Success |
| --- | --- | --- |
| `GET /api/v1/sales` | None | 200 `Sale[]`, newest first then ID, all sales |
| `POST /api/v1/sales/checkout` | Checkout below | 201 `Sale` for first commit; 200 on identical retry |
| `GET /api/v1/sales/by-request-id/{requestId}` | None | 200 `Sale`, or 404 `request_not_found` |

```json
{
  "requestId": "6b89befa-33b0-4d75-8ae1-09be56132d14",
  "items": [{"productId": "94684e3f-e948-4cf3-bd06-7e2d3d0ec6dc", "quantity": 2}],
  "paymentMethod": "cash",
  "cashReceivedCents": 3000,
  "expectedTotalCents": 2500,
  "allowInsufficientStockProductIds": []
}
```

The cart must be nonempty. Merge duplicate products with checked addition. Reject unknown override IDs outside the cart. Override IDs are an explicit set; only those products may go negative. Authoritative prices come from locked active products. A total mismatch returns `total_changed` before writes, with the current total and product prices. The app updates estimates and requires explicit confirmation of a revised request. Quantities, payment validation, sale/items, and stock changes belong to one transaction. Saved names, unit prices, and independent line totals remain unchanged after catalog edits. Item lineNumber starts at 0 and follows sorted normalized product UUID order.

A shortage returns every insufficient product in deterministic UUID order. The app may cancel, explicitly approve products to sell anyway, or save a replenishment adjustment and submit checkout again. A saved adjustment remains if the later sale fails or is cancelled.

## Idempotency and recovery

Checkout and adjustments each have a unique, nonnull requestId and original fingerprint on their business row. IDs are scoped by operation type. Server-generated business UUIDs differ from client request UUIDs. Product writes and reason edits have no request-ID retry guarantee and must not be automatically replayed on uncertain outcomes.

Fingerprint version 1 uses SHA-256 over UTF-8 compact JSON arrays with the following fixed ordering. UUIDs are canonical lowercase strings; numbers are base-10 integers; JSON string escaping is standard; null is explicit. Never hash mutable server values or requestId itself.

- Adjustment: `["stock.adjustment.v1", productId, quantity, normalizedReason]`.
- Checkout: `["sale.checkout.v1", [[productId, mergedQuantity], ...], paymentMethod, cashReceivedCentsOrNull, expectedTotalCents, [sortedUniqueOverrideIds...]]`.

Sort canonical UUID strings lexicographically for item pairs and overrides. Reordering items, splitting an item into duplicate lines, reordering/duplicating overrides, or insignificant reason whitespace does not change identity. Different normalized submitted fields do. Reject invalid input before fingerprinting. A later reason edit does not change the saved original fingerprint; retrying the original adjustment returns the resource with its current edited reason.

Check existing requestId before current product deletion, prices, or stock validation. Same fingerprint returns the committed response; a different fingerprint returns 409 `request_id_reused`. Transactions use READ COMMITTED and take shared `PESSIMISTIC_WRITE` product locks in sorted canonical UUID order, one by one. Recheck requestId after waiting for locks. A duplicate that waited for the first request returns that result even if stock is now insufficient or the product is hidden. The unique request constraint resolves remaining races across different product sets. Let the losing transaction roll back completely, catch only the named request-ID constraint outside that transaction, and read/compare the winner in a fresh transaction. Never keep using an aborted transaction. Lock timeout returns retryable `inventory_busy`.

Lookups are read-only and return committed data after app or server restart. `404 request_not_found` means no committed result is visible yet. It does not prove failure or cancellation; the POST may still execute. Lookup never submits or resumes work.

Before sending an adjustment or checkout, persist only `{requestId, operationType, apiBaseUrl, submittedAt}` in AsyncStorage. Await success before POST. Keep all unresolved markers. No payload, cart, product, business record, queue, worker, or automatic replay is stored. On restart, offer a translated lookup using the marker's recorded backend, including when the configured backend changed. A 200 result confirms the operation, refreshes lists, and clears the marker. A definitive business rejection after rollback permits clearing it. Timeouts, malformed responses, network errors, uncertain 5xx, and lookup 404 retain it. Offer lookup again or manual reconciliation with history. Explicit dismissal after reconciliation does not cancel the server request.

An explicit retry of uncertain input still in memory must reuse the same ID and unchanged body. After restart no payload exists to resend. Do not automatically replace an unresolved action with a new ID. A revised submission after a definitive shortage or price rejection uses a new request ID.

## Errors

```json
{
  "error": {
    "code": "insufficient_stock",
    "details": {
      "shortages": [{"productId": "94684e3f-e948-4cf3-bd06-7e2d3d0ec6dc", "productName": "Coffee", "requested": 2, "available": 1}]
    }
  }
}
```

| HTTP | Codes | Details |
| --- | --- | --- |
| 400 | `validation_failed` | `fields: [{field, code}]`, stable codes such as `required`, `integer`, `out_of_range`, `unknown_field`, `invalid_value` |
| 404 | `product_missing`, `adjustment_missing`, `request_not_found` | Relevant ID when available |
| 409 | `product_name_taken`, `barcode_taken`, `request_id_reused` | Constraint-specific conflict; no SQL exception text |
| 409 | `insufficient_stock` | `shortages` array shown above |
| 409 | `total_changed` | `expectedTotalCents`, `actualTotalCents`, `items: [{productId, productName, quantity, unitPriceCents, lineTotalCents}]` |
| 422 | `cash_received_invalid`, `numeric_overflow` | Payment cannot cover total or calculated result exceeds allowed bounds |
| 503 | `inventory_busy` | Retryable bounded lock/transaction timeout |
| 500 | `internal_error` | No internal diagnostics or SQL in response |

A known business rejection above is returned only after rollback. An unexpected server failure remains uncertain to the client. HTTP responses contain codes and structured values; Portuguese and English text belongs in the Expo dictionaries. A network failure during barcode lookup is a retryable error, never an unknown-product result. Failed reads preserve fetched data; failed writes preserve forms/cart. A failed refresh following a confirmed write is reported separately from the successful mutation.
