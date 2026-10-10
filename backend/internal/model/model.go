package model

import "time"

type Product struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	Barcode           string     `json:"barcode"`
	Category          string     `json:"category"`
	CostCents         *int64     `json:"costCents"`
	SellingPriceCents int64      `json:"sellingPriceCents"`
	Stock             int64      `json:"stock"`
	Version           int64      `json:"version"`
	DeletedAt         *time.Time `json:"deletedAt,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

type SaleLine struct {
	ProductID      string `json:"productId"`
	Name           string `json:"name"`
	Quantity       int64  `json:"quantity"`
	UnitPriceCents int64  `json:"unitPriceCents"`
	LineTotalCents int64  `json:"lineTotalCents"`
}

type Sale struct {
	ID                string     `json:"id"`
	Lines             []SaleLine `json:"lines"`
	TotalCents        int64      `json:"totalCents"`
	PaymentMethod     string     `json:"paymentMethod"`
	CashReceivedCents *int64     `json:"cashReceivedCents,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
}

type StockHistoryEntry struct {
	ID          string    `json:"id"`
	ProductID   string    `json:"productId"`
	ProductName string    `json:"productName"`
	Quantity    int64     `json:"quantity"`
	Reason      *string   `json:"reason"`
	Source      string    `json:"source"`
	CreatedAt   time.Time `json:"createdAt"`
}
