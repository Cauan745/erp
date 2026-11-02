package com.stockroom.erp.stock;

import java.time.Instant;
import java.util.UUID;

public record HistoryEntryResponse(UUID id, UUID productId, String productName, int quantity,
        String reason, String source, Instant createdAt) {}
