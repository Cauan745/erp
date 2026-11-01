package com.stockroom.erp.stock;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import com.stockroom.erp.product.Product;

@Entity
@Table(name = "stock_adjustments")
public class StockAdjustment {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "reason", nullable = true)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "request_fingerprint", nullable = false, updatable = false, length = 64)
    private String requestFingerprint;

    protected StockAdjustment() {}

    public StockAdjustment(Product product, int quantity, String reason, UUID requestId, String requestFingerprint) {
        this.product = product;
        this.quantity = quantity;
        this.reason = reason;
        this.requestId = requestId;
        this.requestFingerprint = requestFingerprint;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Product getProduct() { return product; }
    public int getQuantity() { return quantity; }
    public String getReason() { return reason; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getRequestId() { return requestId; }
    public String getRequestFingerprint() { return requestFingerprint; }
}
