package com.stockroom.erp.product;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "barcode", nullable = true)
    private String barcode;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "cost_cents", nullable = true)
    private Long costCents;

    @Column(name = "selling_price_cents", nullable = false)
    private long sellingPriceCents;

    @Column(name = "stock", nullable = false)
    private int stock;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at", nullable = true)
    private Instant deletedAt;

    protected Product() {}

    public Product(String name, String barcode, String category, Long costCents, long sellingPriceCents, int stock) {
        this.name = name;
        this.barcode = barcode;
        this.category = category;
        this.costCents = costCents;
        this.sellingPriceCents = sellingPriceCents;
        this.stock = stock;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getBarcode() { return barcode; }
    public String getCategory() { return category; }
    public Long getCostCents() { return costCents; }
    public long getSellingPriceCents() { return sellingPriceCents; }
    public int getStock() { return stock; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }
}
