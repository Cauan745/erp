package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"stockroom/backend/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type operationRejection struct {
	Code      string
	Message   string
	Retryable bool
	Details   any
}

func (e *operationRejection) Error() string { return e.Message }

type changeToRecord struct {
	OperationID string
	EntityType  string
	EntityID    string
	ChangeType  string
	Payload     any
	OccurredAt  time.Time
}

type productOperationPayload struct {
	Product syncProduct `json:"product"`
}

type productUpdateOperationPayload struct {
	Product         syncProduct `json:"product"`
	ExpectedVersion int64       `json:"expectedVersion"`
}

type syncProduct struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Barcode    string    `json:"barcode"`
	Category   string    `json:"category"`
	PriceCents int64     `json:"priceCents"`
	Stock      int64     `json:"stock"`
	Version    int64     `json:"version"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type stockAdjustmentOperationPayload struct {
	Adjustment syncAdjustment `json:"adjustment"`
}

type syncAdjustment struct {
	ID        string    `json:"id"`
	ProductID string    `json:"productId"`
	Quantity  int64     `json:"quantity"`
	Reason    *string   `json:"reason"`
	CreatedAt time.Time `json:"createdAt"`
}

type stockReasonOperationPayload struct {
	AdjustmentID string  `json:"adjustmentId"`
	Reason       *string `json:"reason"`
}

type saleOperationPayload struct {
	Sale                             syncSale       `json:"sale"`
	Lines                            []syncSaleLine `json:"lines"`
	AllowInsufficientStockProductIDs []string       `json:"allowInsufficientStockProductIds"`
}

type syncSale struct {
	ID                string    `json:"id"`
	TotalCents        int64     `json:"totalCents"`
	PaymentMethod     string    `json:"paymentMethod"`
	CashReceivedCents *int64    `json:"cashReceivedCents"`
	CreatedAt         time.Time `json:"createdAt"`
}

type syncSaleLine struct {
	ID             string `json:"id"`
	SaleID         string `json:"saleId"`
	LineNumber     int    `json:"lineNumber"`
	ProductID      string `json:"productId"`
	ProductName    string `json:"productName"`
	Quantity       int64  `json:"quantity"`
	UnitPriceCents int64  `json:"unitPriceCents"`
	LineTotalCents int64  `json:"lineTotalCents"`
}

type deleteProductOperationPayload struct {
	ProductID       string `json:"productId"`
	ExpectedVersion int64  `json:"expectedVersion"`
}

func (s *Store) PushOperations(ctx context.Context, operations []model.SyncOperation) ([]model.SyncOperationResult, error) {
	results := make([]model.SyncOperationResult, 0, len(operations))
	for _, operation := range operations {
		result, err := s.processOperation(ctx, operation)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func (s *Store) processOperation(ctx context.Context, operation model.SyncOperation) (model.SyncOperationResult, error) {
	result := model.SyncOperationResult{OperationID: operation.OperationID}
	if strings.TrimSpace(operation.OperationID) == "" || strings.TrimSpace(operation.OperationType) == "" || strings.TrimSpace(operation.AggregateID) == "" {
		return rejectedResult(result, &operationRejection{Code: "operation_invalid", Message: "operation identity is required"})
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return result, fmt.Errorf("begin sync operation: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, operation.OperationID); err != nil {
		return result, fmt.Errorf("lock sync operation: %w", err)
	}

	var existingStatus string
	var existingOutcome []byte
	var existingErrorCode *string
	var existingErrorMessage *string
	var existingSequence *int64
	err = tx.QueryRow(ctx, `
		SELECT status, outcome, error_code, error_message, server_sequence
		FROM processed_sync_operations
		WHERE operation_id = $1;`, operation.OperationID).Scan(&existingStatus, &existingOutcome, &existingErrorCode, &existingErrorMessage, &existingSequence)
	if err == nil {
		if existingStatus == "applied" {
			result.Status = "already_applied"
		} else {
			result.Status = "rejected"
		}
		result.Outcome = existingOutcome
		result.ServerSequence = existingSequence
		if existingStatus == "rejected" {
			result.Error = &model.SyncError{
				Code:    valueOrDefault(existingErrorCode, "operation_rejected"),
				Message: valueOrDefault(existingErrorMessage, "operation was rejected"),
			}
		}
		return result, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return result, fmt.Errorf("read processed operation: %w", err)
	}

	if operation.DependsOnOperationID != "" {
		var dependencyStatus string
		dependencyErr := tx.QueryRow(ctx, `
			SELECT status FROM processed_sync_operations WHERE operation_id = $1;`, operation.DependsOnOperationID).Scan(&dependencyStatus)
		if errors.Is(dependencyErr, pgx.ErrNoRows) {
			return model.SyncOperationResult{OperationID: operation.OperationID, Status: "blocked"}, tx.Rollback(ctx)
		}
		if dependencyErr != nil {
			return result, fmt.Errorf("read operation dependency: %w", dependencyErr)
		}
		if dependencyStatus != "applied" {
			rejection := &operationRejection{Code: "dependency_rejected", Message: "operation dependency was rejected"}
			outcomeJSON, marshalErr := json.Marshal(map[string]any{"error": rejection.Message})
			if marshalErr != nil {
				return result, marshalErr
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO processed_sync_operations
				(operation_id, operation_type, aggregate_id, status, outcome, error_code, error_message, processed_at)
				VALUES ($1, $2, $3, 'rejected', $4, $5, $6, $7);`, operation.OperationID, operation.OperationType, operation.AggregateID, outcomeJSON, rejection.Code, rejection.Message, time.Now().UTC()); err != nil {
				return result, fmt.Errorf("record dependency rejection: %w", err)
			}
			if err := tx.Commit(ctx); err != nil {
				return result, fmt.Errorf("commit dependency rejection: %w", err)
			}
			return model.SyncOperationResult{OperationID: operation.OperationID, Status: "rejected", Outcome: outcomeJSON, Error: rejectionModel(rejection)}, nil
		}
	}

	var outcome any
	var changes []changeToRecord
	var rejection *operationRejection
	switch operation.OperationType {
	case "product.create":
		outcome, changes, rejection = s.applyProductCreate(ctx, tx, operation)
	case "product.update":
		outcome, changes, rejection = s.applyProductUpdate(ctx, tx, operation)
	case "product.delete":
		outcome, changes, rejection = s.applyProductDelete(ctx, tx, operation)
	case "stock.adjustment":
		outcome, changes, rejection = s.applyStockAdjustment(ctx, tx, operation)
	case "stock.reason.update":
		outcome, changes, rejection = s.applyStockReasonUpdate(ctx, tx, operation)
	case "sale.checkout":
		outcome, changes, rejection = s.applySaleCheckout(ctx, tx, operation)
	default:
		rejection = &operationRejection{Code: "operation_type_unsupported", Message: "operation type is not supported"}
	}

	if rejection != nil {
		if rejection.Retryable {
			_ = tx.Rollback(ctx)
			return model.SyncOperationResult{
				OperationID: operation.OperationID,
				Status:      "retryable",
				Error:       rejectionModel(rejection),
			}, nil
		}
		outcomeJSON, marshalErr := json.Marshal(map[string]any{"error": rejection.Message, "details": rejection.Details})
		if marshalErr != nil {
			return result, fmt.Errorf("marshal rejected operation: %w", marshalErr)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO processed_sync_operations
			(operation_id, operation_type, aggregate_id, status, outcome, error_code, error_message, processed_at)
			VALUES ($1, $2, $3, 'rejected', $4, $5, $6, $7);`, operation.OperationID, operation.OperationType, operation.AggregateID, outcomeJSON, rejection.Code, rejection.Message, time.Now().UTC()); err != nil {
			return result, fmt.Errorf("record rejected operation: %w", err)
		}
		if err := tx.Commit(ctx); err != nil {
			return result, fmt.Errorf("commit rejected operation: %w", err)
		}
		return model.SyncOperationResult{
			OperationID: operation.OperationID,
			Status:      "rejected",
			Outcome:     outcomeJSON,
			Error:       rejectionModel(rejection),
		}, nil
	}

	var lastSequence *int64
	for _, change := range changes {
		sequence, err := insertChange(ctx, tx, operation.OperationID, change)
		if err != nil {
			return result, fmt.Errorf("record sync change: %w", err)
		}
		lastSequence = &sequence
	}
	outcomeJSON, err := json.Marshal(outcome)
	if err != nil {
		return result, fmt.Errorf("marshal operation outcome: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO processed_sync_operations
		(operation_id, operation_type, aggregate_id, status, outcome, server_sequence, processed_at)
		VALUES ($1, $2, $3, 'applied', $4, $5, $6);`, operation.OperationID, operation.OperationType, operation.AggregateID, outcomeJSON, lastSequence, time.Now().UTC()); err != nil {
		return result, fmt.Errorf("record applied operation: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return result, fmt.Errorf("commit applied operation: %w", err)
	}
	return model.SyncOperationResult{OperationID: operation.OperationID, Status: "applied", ServerSequence: lastSequence, Outcome: outcomeJSON}, nil
}

func valueOrDefault(value *string, fallback string) string {
	if value == nil || *value == "" {
		return fallback
	}
	return *value
}

func rejectedResult(result model.SyncOperationResult, rejection *operationRejection) (model.SyncOperationResult, error) {
	outcome, err := json.Marshal(map[string]any{"error": rejection.Message, "details": rejection.Details})
	if err != nil {
		return result, err
	}
	result.Status = "rejected"
	result.Outcome = outcome
	result.Error = rejectionModel(rejection)
	return result, nil
}

func rejectionModel(rejection *operationRejection) *model.SyncError {
	details, _ := json.Marshal(rejection.Details)
	return &model.SyncError{Code: rejection.Code, Message: rejection.Message, Retryable: rejection.Retryable, Details: details}
}

func insertChange(ctx context.Context, tx pgx.Tx, operationID string, change changeToRecord) (int64, error) {
	payload, err := json.Marshal(change.Payload)
	if err != nil {
		return 0, err
	}
	var sequence int64
	err = tx.QueryRow(ctx, `
		INSERT INTO change_log (operation_id, entity_type, entity_id, change_type, payload, occurred_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING sequence;`, operationID, change.EntityType, change.EntityID, change.ChangeType, payload, change.OccurredAt).Scan(&sequence)
	return sequence, err
}

func (s *Store) applyProductCreate(ctx context.Context, tx pgx.Tx, operation model.SyncOperation) (any, []changeToRecord, *operationRejection) {
	var payload productOperationPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.Product.ID == "" {
		return nil, nil, &operationRejection{Code: "product_payload_invalid", Message: "product payload is invalid"}
	}
	if payload.Product.ID != operation.AggregateID {
		return nil, nil, &operationRejection{Code: "aggregate_mismatch", Message: "product aggregate does not match the operation"}
	}
	if payload.Product.CreatedAt.IsZero() {
		payload.Product.CreatedAt = time.Now().UTC()
	}
	if payload.Product.UpdatedAt.IsZero() {
		payload.Product.UpdatedAt = payload.Product.CreatedAt
	}
	if payload.Product.Version == 0 {
		payload.Product.Version = 1
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO products (id, name, barcode, category, price_cents, stock, version, updated_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`, payload.Product.ID, payload.Product.Name, payload.Product.Barcode, payload.Product.Category, payload.Product.PriceCents, payload.Product.Stock, payload.Product.Version, payload.Product.UpdatedAt, payload.Product.CreatedAt)
	if err != nil {
		return nil, nil, productDatabaseRejection(err)
	}
	product, err := loadProduct(ctx, tx, payload.Product.ID)
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	return map[string]any{"product": product}, []changeToRecord{{OperationID: operation.OperationID, EntityType: "product", EntityID: product.ID, ChangeType: "upsert", Payload: map[string]any{"product": product}, OccurredAt: time.Now().UTC()}}, nil
}

func (s *Store) applyProductUpdate(ctx context.Context, tx pgx.Tx, operation model.SyncOperation) (any, []changeToRecord, *operationRejection) {
	var payload productUpdateOperationPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.Product.ID == "" {
		return nil, nil, &operationRejection{Code: "product_payload_invalid", Message: "product payload is invalid"}
	}
	product, err := loadProductForUpdate(ctx, tx, payload.Product.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, &operationRejection{Code: "product_missing", Message: "product was not found"}
	}
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	if payload.ExpectedVersion > 0 && product.Version != payload.ExpectedVersion {
		return nil, nil, &operationRejection{Code: "product_conflict", Message: "product changed on the server", Details: map[string]any{"currentProduct": product}}
	}
	updatedAt := payload.Product.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = time.Now().UTC()
	}
	_, err = tx.Exec(ctx, `
		UPDATE products
		SET name = $1, barcode = NULLIF($2, ''), category = $3, price_cents = $4,
			version = version + 1, updated_at = $5
		WHERE id = $6;`, payload.Product.Name, payload.Product.Barcode, payload.Product.Category, payload.Product.PriceCents, updatedAt, payload.Product.ID)
	if err != nil {
		return nil, nil, productDatabaseRejection(err)
	}
	product, err = loadProduct(ctx, tx, payload.Product.ID)
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	change := changeToRecord{OperationID: operation.OperationID, EntityType: "product", EntityID: product.ID, ChangeType: "upsert", Payload: map[string]any{"product": product}, OccurredAt: time.Now().UTC()}
	return map[string]any{"product": product}, []changeToRecord{change}, nil
}

func (s *Store) applyProductDelete(ctx context.Context, tx pgx.Tx, operation model.SyncOperation) (any, []changeToRecord, *operationRejection) {
	var payload deleteProductOperationPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.ProductID == "" {
		return nil, nil, &operationRejection{Code: "product_payload_invalid", Message: "product payload is invalid"}
	}
	product, err := loadProductForUpdate(ctx, tx, payload.ProductID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, &operationRejection{Code: "product_missing", Message: "product was not found"}
	}
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	if payload.ExpectedVersion > 0 && product.Version != payload.ExpectedVersion {
		return nil, nil, &operationRejection{Code: "product_conflict", Message: "product changed on the server", Details: map[string]any{"currentProduct": product}}
	}
	deletedAt := time.Now().UTC()
	if _, err := tx.Exec(ctx, `UPDATE products SET deleted_at = $1, version = version + 1, updated_at = $1 WHERE id = $2`, deletedAt, payload.ProductID); err != nil {
		return nil, nil, transientOperationError(err)
	}
	return map[string]any{"deleted": true, "productId": payload.ProductID}, []changeToRecord{{OperationID: operation.OperationID, EntityType: "product", EntityID: payload.ProductID, ChangeType: "delete", Payload: map[string]any{"productId": payload.ProductID, "deletedAt": deletedAt}, OccurredAt: deletedAt}}, nil
}

func (s *Store) applyStockAdjustment(ctx context.Context, tx pgx.Tx, operation model.SyncOperation) (any, []changeToRecord, *operationRejection) {
	var payload stockAdjustmentOperationPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.Adjustment.ID == "" || payload.Adjustment.ProductID == "" || payload.Adjustment.Quantity == 0 {
		return nil, nil, &operationRejection{Code: "stock_adjustment_invalid", Message: "stock adjustment payload is invalid"}
	}
	if payload.Adjustment.ID != operation.AggregateID {
		return nil, nil, &operationRejection{Code: "aggregate_mismatch", Message: "stock adjustment aggregate does not match the operation"}
	}
	product, err := loadProductForUpdate(ctx, tx, payload.Adjustment.ProductID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, &operationRejection{Code: "product_missing", Message: "product was not found"}
	}
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	createdAt := payload.Adjustment.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	if _, err := tx.Exec(ctx, `UPDATE products SET stock = stock + $1, version = version + 1, updated_at = $2 WHERE id = $3`, payload.Adjustment.Quantity, createdAt, payload.Adjustment.ProductID); err != nil {
		return nil, nil, transientOperationError(err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO stock_adjustments (id, product_id, quantity, reason, created_at)
		VALUES ($1, $2, $3, $4, $5);`, payload.Adjustment.ID, payload.Adjustment.ProductID, payload.Adjustment.Quantity, payload.Adjustment.Reason, createdAt); err != nil {
		return nil, nil, productDatabaseRejection(err)
	}
	product, err = loadProduct(ctx, tx, payload.Adjustment.ProductID)
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	changePayload := map[string]any{"adjustment": payload.Adjustment, "product": product}
	change := changeToRecord{OperationID: operation.OperationID, EntityType: "stock_adjustment", EntityID: payload.Adjustment.ID, ChangeType: "upsert", Payload: changePayload, OccurredAt: createdAt}
	return changePayload, []changeToRecord{change, {OperationID: operation.OperationID, EntityType: "product", EntityID: product.ID, ChangeType: "upsert", Payload: map[string]any{"product": product}, OccurredAt: createdAt}}, nil
}

func (s *Store) applyStockReasonUpdate(ctx context.Context, tx pgx.Tx, operation model.SyncOperation) (any, []changeToRecord, *operationRejection) {
	var payload stockReasonOperationPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.AdjustmentID == "" {
		return nil, nil, &operationRejection{Code: "stock_reason_invalid", Message: "stock reason payload is invalid"}
	}
	var adjustment syncAdjustment
	err := tx.QueryRow(ctx, `SELECT id, product_id, quantity, reason, created_at FROM stock_adjustments WHERE id = $1`, payload.AdjustmentID).Scan(&adjustment.ID, &adjustment.ProductID, &adjustment.Quantity, &adjustment.Reason, &adjustment.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, &operationRejection{Code: "stock_adjustment_missing", Message: "stock adjustment was not found"}
	}
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE stock_adjustments SET reason = $1 WHERE id = $2`, payload.Reason, payload.AdjustmentID); err != nil {
		return nil, nil, transientOperationError(err)
	}
	adjustment.Reason = payload.Reason
	product, err := loadProduct(ctx, tx, adjustment.ProductID)
	if err != nil {
		return nil, nil, transientOperationError(err)
	}
	changePayload := map[string]any{"adjustment": adjustment, "product": product}
	change := changeToRecord{OperationID: operation.OperationID, EntityType: "stock_adjustment", EntityID: adjustment.ID, ChangeType: "upsert", Payload: changePayload, OccurredAt: time.Now().UTC()}
	return changePayload, []changeToRecord{change}, nil
}

func (s *Store) applySaleCheckout(ctx context.Context, tx pgx.Tx, operation model.SyncOperation) (any, []changeToRecord, *operationRejection) {
	var payload saleOperationPayload
	if err := json.Unmarshal(operation.Payload, &payload); err != nil || payload.Sale.ID == "" || len(payload.Lines) == 0 {
		return nil, nil, &operationRejection{Code: "sale_payload_invalid", Message: "sale payload is invalid"}
	}
	if payload.Sale.ID != operation.AggregateID ||
		(payload.Sale.PaymentMethod != "cash" && payload.Sale.PaymentMethod != "debit_card" && payload.Sale.PaymentMethod != "credit_card" && payload.Sale.PaymentMethod != "pix") {
		return nil, nil, &operationRejection{Code: "sale_payload_invalid", Message: "sale aggregate or payment method is invalid"}
	}
	sale := payload.Sale
	if sale.PaymentMethod == "cash" {
		received := sale.TotalCents
		if sale.CashReceivedCents != nil {
			received = *sale.CashReceivedCents
		}
		if received < sale.TotalCents {
			return nil, nil, &operationRejection{Code: "cash_received_invalid", Message: "cash received does not cover the sale total"}
		}
		sale.CashReceivedCents = &received
	} else if sale.CashReceivedCents != nil {
		return nil, nil, &operationRejection{Code: "sale_payload_invalid", Message: "non-cash sales cannot include cash received"}
	}
	var totalCents int64
	requested := make(map[string]int64)
	order := make([]string, 0, len(payload.Lines))
	for _, line := range payload.Lines {
		if line.ID == "" || line.SaleID != payload.Sale.ID || line.ProductID == "" || line.Quantity <= 0 || line.UnitPriceCents < 0 || line.LineTotalCents < 0 {
			return nil, nil, &operationRejection{Code: "sale_payload_invalid", Message: "sale line is invalid"}
		}
		if _, exists := requested[line.ProductID]; !exists {
			order = append(order, line.ProductID)
		}
		requested[line.ProductID] += line.Quantity
		totalCents += line.LineTotalCents
	}
	if totalCents != payload.Sale.TotalCents {
		return nil, nil, &operationRejection{Code: "sale_total_invalid", Message: "sale total does not match its lines"}
	}
	lockedOrder := append([]string(nil), order...)
	sort.Strings(lockedOrder)
	allow := make(map[string]bool, len(payload.AllowInsufficientStockProductIDs))
	for _, productID := range payload.AllowInsufficientStockProductIDs {
		allow[productID] = true
	}
	products := make(map[string]model.Product, len(lockedOrder))
	for _, productID := range lockedOrder {
		product, err := loadProductForUpdate(ctx, tx, productID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, &operationRejection{Code: "product_missing", Message: "product was not found", Details: map[string]any{"productId": productID}}
		}
		if err != nil {
			return nil, nil, transientOperationError(err)
		}
		if product.Stock < requested[productID] && !allow[productID] {
			return nil, nil, &operationRejection{Code: "insufficient_stock", Message: "stock is insufficient for this sale", Details: map[string]any{"productId": productID, "productName": product.Name, "available": product.Stock, "requested": requested[productID]}}
		}
		products[productID] = *product
	}
	createdAt := payload.Sale.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	if _, err := tx.Exec(ctx, `INSERT INTO sales (id, total_cents, payment_method, cash_received_cents, created_at) VALUES ($1, $2, $3, $4, $5)`, sale.ID, sale.TotalCents, sale.PaymentMethod, sale.CashReceivedCents, createdAt); err != nil {
		return nil, nil, productDatabaseRejection(err)
	}
	for _, line := range payload.Lines {
		if _, err := tx.Exec(ctx, `
			INSERT INTO sale_items (id, sale_id, line_number, product_id, product_name, quantity, unit_price_cents, line_total_cents)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`, line.ID, line.SaleID, line.LineNumber, line.ProductID, line.ProductName, line.Quantity, line.UnitPriceCents, line.LineTotalCents); err != nil {
			return nil, nil, productDatabaseRejection(err)
		}
	}
	for _, productID := range lockedOrder {
		if _, err := tx.Exec(ctx, `UPDATE products SET stock = stock - $1, version = version + 1, updated_at = $2 WHERE id = $3 AND deleted_at IS NULL`, requested[productID], createdAt, productID); err != nil {
			return nil, nil, transientOperationError(err)
		}
	}
	updatedProducts := make([]model.Product, 0, len(lockedOrder))
	changes := make([]changeToRecord, 0, len(lockedOrder)+1)
	for _, productID := range lockedOrder {
		product, err := loadProduct(ctx, tx, productID)
		if err != nil {
			return nil, nil, transientOperationError(err)
		}
		updatedProducts = append(updatedProducts, *product)
		changes = append(changes, changeToRecord{OperationID: operation.OperationID, EntityType: "product", EntityID: product.ID, ChangeType: "upsert", Payload: map[string]any{"product": product}, OccurredAt: createdAt})
	}
	changePayload := map[string]any{"sale": sale, "lines": payload.Lines, "products": updatedProducts}
	changes = append(changes, changeToRecord{OperationID: operation.OperationID, EntityType: "sale", EntityID: sale.ID, ChangeType: "upsert", Payload: changePayload, OccurredAt: createdAt})
	return changePayload, changes, nil
}

func loadProduct(ctx context.Context, tx pgx.Tx, id string) (*model.Product, error) {
	var product model.Product
	err := tx.QueryRow(ctx, `
		SELECT id, name, COALESCE(barcode, ''), category, price_cents, stock, version, deleted_at, created_at, updated_at
		FROM products WHERE id = $1;`, id).Scan(&product.ID, &product.Name, &product.Barcode, &product.Category, &product.PriceCents, &product.Stock, &product.Version, &product.DeletedAt, &product.CreatedAt, &product.UpdatedAt)
	return &product, err
}

func loadProductForUpdate(ctx context.Context, tx pgx.Tx, id string) (*model.Product, error) {
	var product model.Product
	err := tx.QueryRow(ctx, `
		SELECT id, name, COALESCE(barcode, ''), category, price_cents, stock, version, deleted_at, created_at, updated_at
		FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE;`, id).Scan(&product.ID, &product.Name, &product.Barcode, &product.Category, &product.PriceCents, &product.Stock, &product.Version, &product.DeletedAt, &product.CreatedAt, &product.UpdatedAt)
	return &product, err
}

func productDatabaseRejection(err error) *operationRejection {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" {
			if pgErr.ConstraintName == "products_barcode_unique" {
				return &operationRejection{Code: "barcode_taken", Message: "barcode is already in use"}
			}
			return &operationRejection{Code: "conflict", Message: "the operation conflicts with existing data"}
		}
		if pgErr.Code == "23503" {
			return &operationRejection{Code: "product_missing", Message: "a referenced product was not found"}
		}
	}
	return transientOperationError(err)
}

func transientOperationError(err error) *operationRejection {
	return &operationRejection{Code: "server_error", Message: err.Error(), Retryable: true}
}

func (s *Store) PullChanges(ctx context.Context, after int64, limit int) (model.SyncPullResponse, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT sequence, operation_id, entity_type, entity_id, change_type, payload, occurred_at
		FROM change_log
		WHERE sequence > $1
		ORDER BY sequence ASC
		LIMIT $2;`, after, limit+1)
	if err != nil {
		return model.SyncPullResponse{}, fmt.Errorf("pull changes: %w", err)
	}
	defer rows.Close()
	changes := make([]model.SyncChange, 0, limit)
	hasMore := false
	for rows.Next() {
		var change model.SyncChange
		if err := rows.Scan(&change.Sequence, &change.OperationID, &change.EntityType, &change.EntityID, &change.ChangeType, &change.Payload, &change.OccurredAt); err != nil {
			return model.SyncPullResponse{}, fmt.Errorf("scan change: %w", err)
		}
		if len(changes) == limit {
			hasMore = true
			break
		}
		changes = append(changes, change)
	}
	if err := rows.Err(); err != nil {
		return model.SyncPullResponse{}, fmt.Errorf("iterate changes: %w", err)
	}
	nextCursor := after
	if len(changes) > 0 {
		nextCursor = changes[len(changes)-1].Sequence
	}
	return model.SyncPullResponse{Changes: changes, NextCursor: nextCursor, HasMore: hasMore}, nil
}
