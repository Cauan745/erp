package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	NewServer(nil).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"status":"ok"`) {
		t.Fatalf("unexpected health response: %s", recorder.Body.String())
	}
}

func TestPullRejectsInvalidCursorBeforeDatabaseAccess(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/sync/pull?after=-1", nil)
	NewServer(nil).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"code":"sync_cursor_invalid"`) {
		t.Fatalf("unexpected error response: %s", recorder.Body.String())
	}
}

func TestPushRejectsOversizedBatchBeforeDatabaseAccess(t *testing.T) {
	operations := make([]string, 101)
	for index := range operations {
		operations[index] = `{"operationId":"op-` + string(rune('a'+index%26)) + `","operationType":"product.create","aggregateId":"product","payload":{},"createdAt":"2026-01-01T00:00:00Z"}`
	}
	body := `{"operations":[` + strings.Join(operations, ",") + `]}`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/sync/push", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	NewServer(nil).Handler().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), `"code":"sync_batch_too_large"`) {
		t.Fatalf("unexpected error response: %s", recorder.Body.String())
	}
}
