package com.stockroom.erp.stock;

import java.time.Instant;
import java.util.UUID;

public record AdjustmentResponse(UUID id, UUID requestId, UUID productId, int quantity, String reason, Instant createdAt) {
    static AdjustmentResponse from(StockAdjustment a) {
        return new AdjustmentResponse(a.getId(), a.getRequestId(), a.getProduct().getId(),
                a.getQuantity(), a.getReason(), a.getCreatedAt());
    }
}
