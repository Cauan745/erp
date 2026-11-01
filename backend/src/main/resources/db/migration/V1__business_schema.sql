-- Fresh schema. Opening stock is a product balance, not a synthetic adjustment.
CREATE TABLE products (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (name = btrim(name) AND name <> ''),
    barcode text,
    category text NOT NULL CHECK (category = btrim(category) AND category <> ''),
    cost_cents bigint CHECK (cost_cents BETWEEN 0 AND 9007199254740991),
    selling_price_cents bigint NOT NULL CHECK (selling_price_cents BETWEEN 0 AND 9007199254740991),
    stock integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    CONSTRAINT products_barcode_normalized CHECK (barcode IS NULL OR (barcode = btrim(barcode) AND barcode <> ''))
);
-- SQLite NOCASE folds only ASCII. Keep accented letters distinct, with C collation.
-- Both indexes deliberately reserve values across soft-deleted products.
CREATE UNIQUE INDEX products_name_unique ON products ((translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') COLLATE "C"));
CREATE UNIQUE INDEX products_barcode_unique ON products (barcode COLLATE "C") WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX products_active_created ON products (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE sales (
    id uuid PRIMARY KEY,
    total_cents bigint NOT NULL CHECK (total_cents BETWEEN 0 AND 9007199254740991),
    payment_method varchar(16) NOT NULL CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix')),
    cash_received_cents bigint CHECK (cash_received_cents BETWEEN 0 AND 9007199254740991),
    created_at timestamptz NOT NULL,
    request_id uuid NOT NULL,
    request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT sales_request_id_unique UNIQUE (request_id),
    CONSTRAINT sales_cash_valid CHECK (
        (payment_method = 'cash' AND cash_received_cents IS NOT NULL AND cash_received_cents >= total_cents)
        OR (payment_method <> 'cash' AND cash_received_cents IS NULL)
    )
);
CREATE INDEX sales_created ON sales (created_at DESC);

CREATE TABLE sale_items (
    id uuid PRIMARY KEY,
    sale_id uuid NOT NULL REFERENCES sales(id),
    product_id uuid NOT NULL REFERENCES products(id),
    line_number integer NOT NULL CHECK (line_number >= 0),
    product_name text NOT NULL CHECK (product_name <> ''),
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price_cents bigint NOT NULL CHECK (unit_price_cents BETWEEN 0 AND 9007199254740991),
    line_total_cents bigint NOT NULL CHECK (line_total_cents BETWEEN 0 AND 9007199254740991),
    CONSTRAINT sale_items_line_unique UNIQUE (sale_id, line_number)
);
CREATE INDEX sale_items_product ON sale_items(product_id);

CREATE TABLE stock_adjustments (
    id uuid PRIMARY KEY,
    product_id uuid NOT NULL REFERENCES products(id),
    quantity integer NOT NULL CHECK (quantity <> 0),
    reason text,
    created_at timestamptz NOT NULL,
    request_id uuid NOT NULL,
    request_fingerprint varchar(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT stock_adjustments_request_id_unique UNIQUE (request_id),
    CONSTRAINT stock_adjustments_reason_normalized CHECK (reason IS NULL OR (reason = btrim(reason) AND reason <> ''))
);
CREATE INDEX stock_adjustments_product ON stock_adjustments(product_id);
CREATE INDEX stock_adjustments_created ON stock_adjustments(created_at DESC);
