package com.stockroom.erp.product;

import java.time.Instant;
import java.util.UUID;

public record ProductResponse(UUID id, String name, String barcode, String category,
                              Long costCents, long sellingPriceCents, int stock,
                              Instant createdAt, Instant updatedAt) {
    static ProductResponse from(Product product) {
        return new ProductResponse(product.getId(), product.getName(), product.getBarcode(),
                product.getCategory(), product.getCostCents(), product.getSellingPriceCents(),
                product.getStock(), product.getCreatedAt(), product.getUpdatedAt());
    }
}
