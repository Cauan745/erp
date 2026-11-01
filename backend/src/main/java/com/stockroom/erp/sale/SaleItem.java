package com.stockroom.erp.sale;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import com.stockroom.erp.product.Product;
import com.stockroom.erp.sale.Sale;

@Entity
@Table(name = "sale_items")
public class SaleItem {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sale_id", nullable = false)
    private Sale sale;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "line_number", nullable = false)
    private int lineNumber;

    @Column(name = "product_name", nullable = false)
    private String productName;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Column(name = "unit_price_cents", nullable = false)
    private long unitPriceCents;

    @Column(name = "line_total_cents", nullable = false)
    private long lineTotalCents;

    protected SaleItem() {}

    public SaleItem(Sale sale, Product product, int lineNumber, String productName, int quantity, long unitPriceCents, long lineTotalCents) {
        this.sale = sale;
        this.product = product;
        this.lineNumber = lineNumber;
        this.productName = productName;
        this.quantity = quantity;
        this.unitPriceCents = unitPriceCents;
        this.lineTotalCents = lineTotalCents;
    }

    public UUID getId() { return id; }
    public Sale getSale() { return sale; }
    public Product getProduct() { return product; }
    public int getLineNumber() { return lineNumber; }
    public String getProductName() { return productName; }
    public int getQuantity() { return quantity; }
    public long getUnitPriceCents() { return unitPriceCents; }
    public long getLineTotalCents() { return lineTotalCents; }
}
