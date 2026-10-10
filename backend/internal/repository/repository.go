package repository

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"stockroom/backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const AutoSaleReplenishmentReason = "sale-shortage-replenishment"

type Store struct{ pool *pgxpool.Pool }

func NewStore(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

type CreateProductInput struct {
	Name              string
	Barcode           string
	Category          string
	CostCents         *int64
	SellingPriceCents int64
	Stock             int64
}

type StockAdjustmentInput struct {
	ProductID string
	Quantity  int64
	Reason    string
}

type CheckoutLine struct {
	ProductID string
	Quantity  int64
}

type CheckoutInput struct {
	Lines                            []CheckoutLine
	AllowInsufficientStockProductIDs []string
	PaymentMethod                    string
	CashReceivedCents                *int64
}

func (s *Store) ListProducts(ctx context.Context) ([]model.Product, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, COALESCE(barcode, ''), category, cost_cents, selling_price_cents, stock, version, deleted_at, created_at, updated_at
		FROM products
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC, lower(name) ASC;`)
	if err != nil {
		return nil, fmt.Errorf("list products: %w", err)
	}
	defer rows.Close()

	products := make([]model.Product, 0)
	for rows.Next() {
		var product model.Product
		if err := rows.Scan(&product.ID, &product.Name, &product.Barcode, &product.Category, &product.CostCents, &product.SellingPriceCents, &product.Stock, &product.Version, &product.DeletedAt, &product.CreatedAt, &product.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan product: %w", err)
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate products: %w", err)
	}
	return products, nil
}

func (s *Store) CreateProduct(ctx context.Context, input CreateProductInput) (model.Product, error) {
	createdAt := time.Now().UTC()
	barcode := strings.TrimSpace(input.Barcode)
	category := strings.TrimSpace(input.Category)
	if category == "" {
		category = "General"
	}

	var product model.Product
	err := s.pool.QueryRow(ctx, `
		INSERT INTO products (id, name, barcode, category, cost_cents, selling_price_cents, stock, updated_at, created_at)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $8)
		RETURNING id, name, COALESCE(barcode, ''), category, cost_cents, selling_price_cents, stock, version, deleted_at, created_at, updated_at;`,
		newID("product"), strings.TrimSpace(input.Name), barcode, category, input.CostCents, input.SellingPriceCents, input.Stock, createdAt,
	).Scan(&product.ID, &product.Name, &product.Barcode, &product.Category, &product.CostCents, &product.SellingPriceCents, &product.Stock, &product.Version, &product.DeletedAt, &product.CreatedAt, &product.UpdatedAt)
	if err != nil {
		return model.Product{}, mapDatabaseError("create product", err)
	}
	return product, nil
}

func (s *Store) FindProductByBarcode(ctx context.Context, barcode string) (*model.Product, error) {
	var product model.Product
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, COALESCE(barcode, ''), category, cost_cents, selling_price_cents, stock, version, deleted_at, created_at, updated_at
		FROM products WHERE barcode = $1 AND deleted_at IS NULL LIMIT 1;`, strings.TrimSpace(barcode)).Scan(
		&product.ID, &product.Name, &product.Barcode, &product.Category, &product.CostCents, &product.SellingPriceCents, &product.Stock, &product.Version, &product.DeletedAt, &product.CreatedAt, &product.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find product by barcode: %w", err)
	}
	return &product, nil
}

func (s *Store) AdjustStock(ctx context.Context, input StockAdjustmentInput) error {
	if input.Quantity == 0 {
		return ErrInvalidQuantity
	}
	createdAt := time.Now().UTC()
	reason := strings.TrimSpace(input.Reason)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin stock adjustment: %w", err)
	}
	defer tx.Rollback(ctx)

	result, err := tx.Exec(ctx, `UPDATE products SET stock = stock + $1, version = version + 1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, input.Quantity, createdAt, input.ProductID)
	if err != nil {
		return fmt.Errorf("update stock: %w", err)
	}
	if result.RowsAffected() != 1 {
		return ErrProductMissing
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO stock_adjustments (id, product_id, quantity, reason, created_at)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5);`, newID("stock-adjustment"), input.ProductID, input.Quantity, reason, createdAt); err != nil {
		return fmt.Errorf("insert stock adjustment: %w", err)
	}
	return tx.Commit(ctx)
}

func (s *Store) UpdateStockAdjustmentReason(ctx context.Context, id, reason string) error {
	result, err := s.pool.Exec(ctx, `UPDATE stock_adjustments SET reason = NULLIF($1, '') WHERE id = $2`, strings.TrimSpace(reason), id)
	if err != nil {
		return fmt.Errorf("update stock adjustment reason: %w", err)
	}
	if result.RowsAffected() != 1 {
		return ErrStockAdjustmentMissing
	}
	return nil
}

func (s *Store) ListStockHistory(ctx context.Context, limit int) ([]model.StockHistoryEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, product_id, product_name, quantity, reason, source, created_at
		FROM (
			SELECT si.id, si.product_id, si.product_name, -si.quantity AS quantity,
				NULL::TEXT AS reason, 'sale' AS source, sales.created_at
			FROM sale_items si INNER JOIN sales ON sales.id = si.sale_id
			UNION ALL
			SELECT sa.id, sa.product_id, p.name, sa.quantity, sa.reason,
				'adjustment' AS source, sa.created_at
			FROM stock_adjustments sa INNER JOIN products p ON p.id = sa.product_id
		) history
		ORDER BY created_at DESC
		LIMIT $1;`, limit)
	if err != nil {
		return nil, fmt.Errorf("list stock history: %w", err)
	}
	defer rows.Close()

	history := make([]model.StockHistoryEntry, 0)
	for rows.Next() {
		var entry model.StockHistoryEntry
		if err := rows.Scan(&entry.ID, &entry.ProductID, &entry.ProductName, &entry.Quantity, &entry.Reason, &entry.Source, &entry.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan stock history: %w", err)
		}
		history = append(history, entry)
	}
	return history, rows.Err()
}

func (s *Store) ListSales(ctx context.Context) ([]model.Sale, error) {
	saleRows, err := s.pool.Query(ctx, `SELECT id, total_cents, payment_method, cash_received_cents, created_at FROM sales ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list sales: %w", err)
	}
	defer saleRows.Close()
	sales := make([]model.Sale, 0)
	byID := make(map[string]int)
	for saleRows.Next() {
		var sale model.Sale
		if err := saleRows.Scan(&sale.ID, &sale.TotalCents, &sale.PaymentMethod, &sale.CashReceivedCents, &sale.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan sale: %w", err)
		}
		sale.Lines = []model.SaleLine{}
		sales = append(sales, sale)
		byID[sale.ID] = len(sales) - 1
	}
	if err := saleRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sales: %w", err)
	}

	itemRows, err := s.pool.Query(ctx, `
		SELECT id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents
		FROM sale_items ORDER BY sale_id, line_number;`)
	if err != nil {
		return nil, fmt.Errorf("list sale items: %w", err)
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var itemID, saleID string
		var lineNumber int
		var line model.SaleLine
		if err := itemRows.Scan(&itemID, &saleID, &lineNumber, &line.ProductID, &line.Name, &line.Quantity, &line.UnitPriceCents, &line.LineTotalCents); err != nil {
			return nil, fmt.Errorf("scan sale item: %w", err)
		}
		if saleIndex, exists := byID[saleID]; exists {
			sales[saleIndex].Lines = append(sales[saleIndex].Lines, line)
		}
	}
	return sales, itemRows.Err()
}

func (s *Store) Checkout(ctx context.Context, input CheckoutInput) (model.Sale, error) {
	if len(input.Lines) == 0 {
		return model.Sale{}, ErrEmptySale
	}
	paymentMethod := input.PaymentMethod
	if paymentMethod == "" {
		paymentMethod = "cash"
	}
	if paymentMethod != "cash" && paymentMethod != "debit_card" && paymentMethod != "credit_card" && paymentMethod != "pix" {
		return model.Sale{}, ErrInvalidPaymentMethod
	}

	requested := make(map[string]int64)
	order := make([]string, 0, len(input.Lines))
	for _, line := range input.Lines {
		if line.Quantity <= 0 {
			return model.Sale{}, ErrInvalidQuantity
		}
		if _, exists := requested[line.ProductID]; !exists {
			order = append(order, line.ProductID)
		}
		requested[line.ProductID] += line.Quantity
	}
	lockedOrder := append([]string(nil), order...)
	sort.Strings(lockedOrder)
	allow := make(map[string]bool, len(input.AllowInsufficientStockProductIDs))
	for _, id := range input.AllowInsufficientStockProductIDs {
		allow[id] = true
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return model.Sale{}, fmt.Errorf("begin checkout: %w", err)
	}
	defer tx.Rollback(ctx)

	products := make(map[string]model.SaleLine, len(lockedOrder))
	for _, productID := range lockedOrder {
		var product model.Product
		err := tx.QueryRow(ctx, `
			SELECT id, name, selling_price_cents, stock
			FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE;`, productID).Scan(&product.ID, &product.Name, &product.SellingPriceCents, &product.Stock)
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Sale{}, ErrProductMissing
		}
		if err != nil {
			return model.Sale{}, fmt.Errorf("lock product: %w", err)
		}
		quantity := requested[productID]
		if product.Stock < quantity && !allow[productID] {
			return model.Sale{}, &StockShortageError{ProductID: product.ID, ProductName: product.Name, Available: product.Stock, Requested: quantity}
		}
		products[productID] = model.SaleLine{ProductID: product.ID, Name: product.Name, Quantity: quantity, UnitPriceCents: product.SellingPriceCents, LineTotalCents: product.SellingPriceCents * quantity}
	}

	createdAt := time.Now().UTC()
	saleID := newID("sale")
	lines := make([]model.SaleLine, 0, len(order))
	var totalCents int64
	for _, productID := range order {
		line := products[productID]
		if _, err := tx.Exec(ctx, `UPDATE products SET stock = stock - $1, version = version + 1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, line.Quantity, createdAt, line.ProductID); err != nil {
			return model.Sale{}, fmt.Errorf("decrement stock: %w", err)
		}
		lines = append(lines, line)
		totalCents += line.LineTotalCents
	}
	var cashReceivedCents *int64
	if paymentMethod == "cash" {
		received := totalCents
		if input.CashReceivedCents != nil {
			received = *input.CashReceivedCents
		}
		if received < totalCents {
			return model.Sale{}, ErrInvalidCashReceived
		}
		cashReceivedCents = &received
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sales (id, total_cents, payment_method, cash_received_cents, created_at) VALUES ($1, $2, $3, $4, $5)`, saleID, totalCents, paymentMethod, cashReceivedCents, createdAt); err != nil {
		return model.Sale{}, fmt.Errorf("insert sale: %w", err)
	}
	for lineNumber, line := range lines {
		if _, err := tx.Exec(ctx, `
			INSERT INTO sale_items (id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`, newID("sale-item"), saleID, lineNumber, line.ProductID, line.Name, line.Quantity, line.UnitPriceCents, line.LineTotalCents); err != nil {
			return model.Sale{}, fmt.Errorf("insert sale item: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Sale{}, fmt.Errorf("commit checkout: %w", err)
	}
	return model.Sale{ID: saleID, Lines: lines, TotalCents: totalCents, PaymentMethod: paymentMethod, CashReceivedCents: cashReceivedCents, CreatedAt: createdAt}, nil
}

func mapDatabaseError(operation string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		switch pgErr.ConstraintName {
		case "products_barcode_unique":
			return fmt.Errorf("barcode already exists: %w", err)
		case "products_name_unique":
			return fmt.Errorf("product name already exists: %w", err)
		}
	}
	return fmt.Errorf("%s: %w", operation, err)
}

func newID(prefix string) string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%x", prefix, buffer)
}
