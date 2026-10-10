package repository

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"stockroom/backend/internal/database"
	"stockroom/backend/internal/model"
)

func TestCheckoutOperationIsIdempotent(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := database.Connect(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	store := NewStore(pool)
	productID := "integration-product-" + time.Now().UTC().Format("20060102150405.000000000")
	product, err := store.CreateProduct(ctx, CreateProductInput{Name: "Integration Product", Category: "Test", SellingPriceCents: 100, Stock: 2})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE products SET id = $1 WHERE id = $2`, productID, product.ID); err != nil {
		t.Fatal(err)
	}
	product.ID = productID

	defer func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM sale_items WHERE sale_id LIKE 'integration-sale-%'`)
		_, _ = pool.Exec(context.Background(), `DELETE FROM sales WHERE id LIKE 'integration-sale-%'`)
		_, _ = pool.Exec(context.Background(), `DELETE FROM change_log WHERE operation_id LIKE 'integration-operation-%'`)
		_, _ = pool.Exec(context.Background(), `DELETE FROM processed_sync_operations WHERE operation_id LIKE 'integration-operation-%'`)
		_, _ = pool.Exec(context.Background(), `DELETE FROM products WHERE id = $1`, productID)
	}()

	saleID := "integration-sale-" + time.Now().UTC().Format("150405.000000000")
	operationID := "integration-operation-" + time.Now().UTC().Format("150405.000000000")
	createdAt := time.Now().UTC()
	payload, err := json.Marshal(map[string]any{
		"sale": map[string]any{"id": saleID, "totalCents": 100, "paymentMethod": "cash", "createdAt": createdAt},
		"lines": []map[string]any{{
			"id":             "integration-sale-item-" + saleID,
			"saleId":         saleID,
			"lineNumber":     0,
			"productId":      productID,
			"productName":    "Integration Product",
			"quantity":       1,
			"unitPriceCents": 100,
			"lineTotalCents": 100,
		}},
		"allowInsufficientStockProductIds": []string{},
	})
	if err != nil {
		t.Fatal(err)
	}

	operation := model.SyncOperation{
		OperationID:   operationID,
		OperationType: "sale.checkout",
		AggregateID:   saleID,
		Payload:       payload,
		CreatedAt:     createdAt,
	}
	first, err := store.PushOperations(ctx, []model.SyncOperation{operation})
	if err != nil {
		t.Fatal(err)
	}
	second, err := store.PushOperations(ctx, []model.SyncOperation{operation})
	if err != nil {
		t.Fatal(err)
	}
	if first[0].Status != "applied" || second[0].Status != "already_applied" {
		t.Fatalf("unexpected operation statuses: first=%s second=%s", first[0].Status, second[0].Status)
	}

	var stock int64
	if err := pool.QueryRow(ctx, `SELECT stock FROM products WHERE id = $1`, productID).Scan(&stock); err != nil {
		t.Fatal(err)
	}
	if stock != 1 {
		t.Fatalf("expected stock 1 after one accepted sale, got %d", stock)
	}
	var saleCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM sales WHERE id = $1`, saleID).Scan(&saleCount); err != nil {
		t.Fatal(err)
	}
	if saleCount != 1 {
		t.Fatalf("expected one sale, got %d", saleCount)
	}
}
