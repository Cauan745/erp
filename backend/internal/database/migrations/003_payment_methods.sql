ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_payment_method_check
    CHECK (payment_method IN ('cash', 'debit_card', 'credit_card', 'pix'));

ALTER TABLE sales
  ADD COLUMN cash_received_cents BIGINT;

UPDATE sales
SET cash_received_cents = total_cents
WHERE payment_method = 'cash' AND cash_received_cents IS NULL;

ALTER TABLE sales
  ADD CONSTRAINT sales_cash_received_check
    CHECK (cash_received_cents IS NULL OR cash_received_cents >= 0);
