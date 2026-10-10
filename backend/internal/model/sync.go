package model

import (
	"encoding/json"
	"time"
)

type SyncOperation struct {
	OperationID          string          `json:"operationId"`
	OperationType        string          `json:"operationType"`
	AggregateID          string          `json:"aggregateId"`
	DependsOnOperationID string          `json:"dependsOnOperationId,omitempty"`
	Payload              json.RawMessage `json:"payload"`
	CreatedAt            time.Time       `json:"createdAt"`
}

type SyncPushRequest struct {
	Operations []SyncOperation `json:"operations"`
}

type SyncOperationResult struct {
	OperationID    string          `json:"operationId"`
	Status         string          `json:"status"`
	ServerSequence *int64          `json:"serverSequence,omitempty"`
	Outcome        json.RawMessage `json:"outcome,omitempty"`
	Error          *SyncError      `json:"error,omitempty"`
}

type SyncError struct {
	Code      string          `json:"code"`
	Message   string          `json:"message"`
	Retryable bool            `json:"retryable"`
	Details   json.RawMessage `json:"details,omitempty"`
}

type SyncPushResponse struct {
	Results []SyncOperationResult `json:"results"`
}

type SyncChange struct {
	Sequence    int64           `json:"sequence"`
	OperationID string          `json:"operationId"`
	EntityType  string          `json:"entityType"`
	EntityID    string          `json:"entityId"`
	ChangeType  string          `json:"changeType"`
	Payload     json.RawMessage `json:"payload"`
	OccurredAt  time.Time       `json:"occurredAt"`
}

type SyncPullResponse struct {
	Changes    []SyncChange `json:"changes"`
	NextCursor int64        `json:"nextCursor"`
	HasMore    bool         `json:"hasMore"`
}
