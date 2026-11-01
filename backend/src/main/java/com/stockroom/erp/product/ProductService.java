package com.stockroom.erp.product;

import com.stockroom.erp.common.ApiException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(isolation = Isolation.READ_COMMITTED, timeout = 20)
public class ProductService {
    private final ProductRepository products;

    public ProductService(ProductRepository products) { this.products = products; }

    @Transactional(readOnly = true, timeout = 20)
    public List<ProductResponse> list() {
        return products.findActiveOrdered().stream().map(ProductResponse::from).toList();
    }

    @Transactional(readOnly = true, timeout = 20)
    public ProductResponse byBarcode(String barcode) {
        String normalized = barcode.trim();
        if (normalized.isEmpty()) throw ApiException.validation("barcode", "required");
        return products.findByBarcodeAndDeletedAtIsNull(normalized).map(ProductResponse::from)
                .orElseThrow(() -> new ApiException(404, "product_missing", Map.of()));
    }

    public ProductResponse create(CreateProductRequest request) {
        Product product = new Product(name(request.name()), nullableText(request.barcode()),
                category(request.category()), request.costCents(), request.sellingPriceCents(),
                request.stock() == null ? 0 : request.stock());
        return ProductResponse.from(products.saveAndFlush(product));
    }

    public ProductResponse update(UUID id, UpdateProductRequest request) {
        Product product = locked(id);
        if (product.getDeletedAt() != null) throw missing(id);
        product.updateMetadata(name(request.name()), nullableText(request.barcode()),
                category(request.category()), request.costCents(), request.sellingPriceCents());
        products.flush();
        return ProductResponse.from(product);
    }

    public void delete(UUID id) {
        locked(id).hide();
    }

    private Product locked(UUID id) {
        return products.findByIdForUpdate(id).orElseThrow(() -> missing(id));
    }

    private static ApiException missing(UUID id) {
        return new ApiException(404, "product_missing", Map.of("productId", id));
    }

    private static String name(String value) {
        if (value == null || value.trim().isEmpty()) throw ApiException.validation("name", "required");
        return value.trim();
    }

    private static String nullableText(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    private static String category(String value) {
        String normalized = nullableText(value);
        return normalized == null ? "General" : normalized;
    }
}
