package com.stockroom.erp.sale;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sales")
public class Sale {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "total_cents", nullable = false)
    private long totalCents;

    @Convert(converter = PaymentMethodConverter.class)
    @Column(name = "payment_method", nullable = false, length = 16)
    private PaymentMethod paymentMethod;

    @Column(name = "cash_received_cents", nullable = true)
    private Long cashReceivedCents;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "request_fingerprint", nullable = false, updatable = false, length = 64)
    private String requestFingerprint;

    protected Sale() {}

    public Sale(long totalCents, PaymentMethod paymentMethod, Long cashReceivedCents, UUID requestId, String requestFingerprint) {
        this.totalCents = totalCents;
        this.paymentMethod = paymentMethod;
        this.cashReceivedCents = cashReceivedCents;
        this.requestId = requestId;
        this.requestFingerprint = requestFingerprint;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public long getTotalCents() { return totalCents; }
    public PaymentMethod getPaymentMethod() { return paymentMethod; }
    public Long getCashReceivedCents() { return cashReceivedCents; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getRequestId() { return requestId; }
    public String getRequestFingerprint() { return requestFingerprint; }
}
