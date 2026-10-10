package repository

import "fmt"

var (
	ErrProductMissing         = fmt.Errorf("product missing")
	ErrStockAdjustmentMissing = fmt.Errorf("stock adjustment missing")
	ErrEmptySale              = fmt.Errorf("empty sale")
	ErrInvalidQuantity        = fmt.Errorf("invalid quantity")
	ErrInvalidPaymentMethod   = fmt.Errorf("invalid payment method")
	ErrInvalidCashReceived    = fmt.Errorf("invalid cash received")
)

type StockShortageError struct {
	ProductID   string
	ProductName string
	Available   int64
	Requested   int64
}

func (e *StockShortageError) Error() string { return "insufficient stock" }
