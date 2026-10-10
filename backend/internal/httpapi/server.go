package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"stockroom/backend/internal/model"
	"stockroom/backend/internal/repository"
)

type Server struct {
	store *repository.Store
}

func NewServer(store *repository.Store) *Server { return &Server{store: store} }

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /api/v1/products", s.listProducts)
	mux.HandleFunc("POST /api/v1/products", s.createProduct)
	mux.HandleFunc("GET /api/v1/products/by-barcode", s.findProductByBarcode)
	mux.HandleFunc("POST /api/v1/products/{id}/stock", s.adjustStock)
	mux.HandleFunc("GET /api/v1/stock/history", s.listStockHistory)
	mux.HandleFunc("PATCH /api/v1/stock/adjustments/{id}", s.updateStockAdjustmentReason)
	mux.HandleFunc("GET /api/v1/sales", s.listSales)
	mux.HandleFunc("POST /api/v1/sales/checkout", s.checkout)
	mux.HandleFunc("POST /api/v1/sync/push", s.pushSync)
	mux.HandleFunc("GET /api/v1/sync/pull", s.pullSync)

	return withJSON(withCORS(withRecovery(mux)))
}

type createProductRequest struct {
	Name              string `json:"name"`
	Barcode           string `json:"barcode"`
	Category          string `json:"category"`
	CostCents         *int64 `json:"costCents"`
	SellingPriceCents int64  `json:"sellingPriceCents"`
	Stock             int64  `json:"stock"`
}

type stockAdjustmentRequest struct {
	Quantity int64  `json:"quantity"`
	Reason   string `json:"reason"`
}

type updateReasonRequest struct {
	Reason string `json:"reason"`
}

type checkoutRequest struct {
	PaymentMethod     string `json:"paymentMethod"`
	CashReceivedCents *int64 `json:"cashReceivedCents"`
	Lines             []struct {
		ProductID string `json:"productId"`
		Quantity  int64  `json:"quantity"`
	} `json:"lines"`
	AllowInsufficientStockProductIDs []string `json:"allowInsufficientStockProductIds"`
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) {
	products, err := s.store.ListProducts(r.Context())
	if err != nil {
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"products": products})
}

func (s *Server) createProduct(w http.ResponseWriter, r *http.Request) {
	var request createProductRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" {
		writeError(w, http.StatusBadRequest, "product_name_required", "name is required", nil)
		return
	}
	if request.SellingPriceCents < 0 || (request.CostCents != nil && *request.CostCents < 0) {
		writeError(w, http.StatusBadRequest, "product_price_invalid", "sellingPriceCents and costCents must be non-negative", nil)
		return
	}

	product, err := s.store.CreateProduct(r.Context(), repository.CreateProductInput{
		Name: request.Name, Barcode: request.Barcode, Category: request.Category, CostCents: request.CostCents, SellingPriceCents: request.SellingPriceCents, Stock: request.Stock,
	})
	if err != nil {
		if strings.Contains(err.Error(), "barcode already exists") {
			writeError(w, http.StatusConflict, "barcode_taken", "barcode is already in use", nil)
			return
		}
		if strings.Contains(err.Error(), "product name already exists") {
			writeError(w, http.StatusConflict, "product_name_taken", "product name is already in use", nil)
			return
		}
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, product)
}

func (s *Server) findProductByBarcode(w http.ResponseWriter, r *http.Request) {
	barcode := strings.TrimSpace(r.URL.Query().Get("barcode"))
	if barcode == "" {
		writeError(w, http.StatusBadRequest, "barcode_required", "barcode is required", nil)
		return
	}
	product, err := s.store.FindProductByBarcode(r.Context(), barcode)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	if product == nil {
		writeError(w, http.StatusNotFound, "product_missing", "product was not found", nil)
		return
	}
	writeJSON(w, http.StatusOK, product)
}

func (s *Server) adjustStock(w http.ResponseWriter, r *http.Request) {
	var request stockAdjustmentRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if request.Quantity == 0 {
		writeError(w, http.StatusBadRequest, "stock_change_invalid", "quantity must be a non-zero integer", nil)
		return
	}
	if err := s.store.AdjustStock(r.Context(), repository.StockAdjustmentInput{
		ProductID: r.PathValue("id"), Quantity: request.Quantity, Reason: request.Reason,
	}); err != nil {
		switch {
		case errors.Is(err, repository.ErrProductMissing):
			writeError(w, http.StatusNotFound, "product_missing", "product was not found", nil)
		case errors.Is(err, repository.ErrInvalidQuantity):
			writeError(w, http.StatusBadRequest, "stock_change_invalid", "quantity must be a non-zero integer", nil)
		default:
			writeInternalError(w, err)
		}
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listStockHistory(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 {
			writeError(w, http.StatusBadRequest, "limit_invalid", "limit must be a positive integer", nil)
			return
		}
		limit = parsed
	}
	history, err := s.store.ListStockHistory(r.Context(), limit)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"history": history})
}

func (s *Server) updateStockAdjustmentReason(w http.ResponseWriter, r *http.Request) {
	var request updateReasonRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := s.store.UpdateStockAdjustmentReason(r.Context(), r.PathValue("id"), request.Reason); err != nil {
		if errors.Is(err, repository.ErrStockAdjustmentMissing) {
			writeError(w, http.StatusNotFound, "stock_adjustment_missing", "stock adjustment was not found", nil)
			return
		}
		writeInternalError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listSales(w http.ResponseWriter, r *http.Request) {
	sales, err := s.store.ListSales(r.Context())
	if err != nil {
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sales": sales})
}

func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	var request checkoutRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	input := repository.CheckoutInput{
		AllowInsufficientStockProductIDs: request.AllowInsufficientStockProductIDs,
		PaymentMethod:                    request.PaymentMethod,
		CashReceivedCents:                request.CashReceivedCents,
	}
	for _, line := range request.Lines {
		input.Lines = append(input.Lines, repository.CheckoutLine{ProductID: strings.TrimSpace(line.ProductID), Quantity: line.Quantity})
	}
	sale, err := s.store.Checkout(r.Context(), input)
	if err != nil {
		var shortage *repository.StockShortageError
		switch {
		case errors.Is(err, repository.ErrEmptySale):
			writeError(w, http.StatusBadRequest, "empty_sale", "at least one sale line is required", nil)
		case errors.Is(err, repository.ErrInvalidQuantity):
			writeError(w, http.StatusBadRequest, "sale_quantity_invalid", "sale quantities must be positive integers", nil)
		case errors.Is(err, repository.ErrInvalidPaymentMethod):
			writeError(w, http.StatusBadRequest, "payment_method_invalid", "payment method is invalid", nil)
		case errors.Is(err, repository.ErrInvalidCashReceived):
			writeError(w, http.StatusBadRequest, "cash_received_invalid", "cash received must cover the sale total", nil)
		case errors.Is(err, repository.ErrProductMissing):
			writeError(w, http.StatusNotFound, "product_missing", "product was not found", nil)
		case errors.As(err, &shortage):
			writeError(w, http.StatusConflict, "insufficient_stock", "stock is insufficient for this sale", map[string]any{
				"productId": shortage.ProductID, "productName": shortage.ProductName, "available": shortage.Available, "requested": shortage.Requested,
			})
		default:
			writeInternalError(w, err)
		}
		return
	}
	writeJSON(w, http.StatusCreated, sale)
}

func (s *Server) pushSync(w http.ResponseWriter, r *http.Request) {
	var request model.SyncPushRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if len(request.Operations) == 0 {
		writeJSON(w, http.StatusOK, model.SyncPushResponse{Results: []model.SyncOperationResult{}})
		return
	}
	if len(request.Operations) > 100 {
		writeError(w, http.StatusBadRequest, "sync_batch_too_large", "a sync batch cannot contain more than 100 operations", nil)
		return
	}
	results, err := s.store.PushOperations(r.Context(), request.Operations)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, model.SyncPushResponse{Results: results})
}

func (s *Server) pullSync(w http.ResponseWriter, r *http.Request) {
	after := int64(0)
	limit := 100
	if rawAfter := r.URL.Query().Get("after"); rawAfter != "" {
		parsed, err := strconv.ParseInt(rawAfter, 10, 64)
		if err != nil || parsed < 0 {
			writeError(w, http.StatusBadRequest, "sync_cursor_invalid", "after must be a non-negative integer", nil)
			return
		}
		after = parsed
	}
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 || parsed > 500 {
			writeError(w, http.StatusBadRequest, "sync_limit_invalid", "limit must be between 1 and 500", nil)
			return
		}
		limit = parsed
	}
	response, err := s.store.PullChanges(r.Context(), after, limit)
	if err != nil {
		writeInternalError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func withJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(w, r)
	})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("panic handling %s %s: %v", r.Method, r.URL.Path, recovered)
				writeError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json", "request body is invalid", nil)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	payload := map[string]any{"error": map[string]any{"code": code, "message": message}}
	if details != nil {
		payload["error"].(map[string]any)["details"] = details
	}
	writeJSON(w, status, payload)
}

func writeInternalError(w http.ResponseWriter, err error) {
	log.Printf("request failed: %v", err)
	writeError(w, http.StatusInternalServerError, "internal_error", "internal server error", nil)
}
