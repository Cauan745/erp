package com.stockroom.erp.sale;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SaleResponse(UUID id, UUID requestId, long totalCents, String paymentMethod,
        Long cashReceivedCents, Long changeCents, Instant createdAt, List<Item> items) {
    public record Item(UUID id, UUID productId, int lineNumber, String productName,
            int quantity, long unitPriceCents, long lineTotalCents) {
        static Item from(SaleItem item) {
            return new Item(item.getId(), item.getProduct().getId(), item.getLineNumber(), item.getProductName(),
                    item.getQuantity(), item.getUnitPriceCents(), item.getLineTotalCents());
        }
    }
    static SaleResponse from(Sale sale, List<SaleItem> items) {
        Long cash = sale.getCashReceivedCents();
        return new SaleResponse(sale.getId(), sale.getRequestId(), sale.getTotalCents(), sale.getPaymentMethod().value(),
                cash, cash == null ? null : cash - sale.getTotalCents(), sale.getCreatedAt(),
                items.stream().map(Item::from).toList());
    }
}
