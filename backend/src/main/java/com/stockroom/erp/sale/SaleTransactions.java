package com.stockroom.erp.sale;

import com.stockroom.erp.common.ApiException;
import com.stockroom.erp.product.Product;
import com.stockroom.erp.product.ProductRepository;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static com.stockroom.erp.common.RequestFingerprints.MAX_SAFE_CENTS;

@Service
@Transactional(isolation = Isolation.READ_COMMITTED, timeout = 20)
public class SaleTransactions {
    public record Result(SaleResponse sale, boolean created) {}
    public record PricedItem(UUID productId, String productName, int quantity, long unitPriceCents, long lineTotalCents) {}
    public record Shortage(UUID productId, String productName, int requested, int available) {}
    private final SaleRepository sales;
    private final SaleItemRepository items;
    private final ProductRepository products;
    public SaleTransactions(SaleRepository sales, SaleItemRepository items, ProductRepository products) {
        this.sales = sales; this.items = items; this.products = products;
    }

    public Result checkout(SaleService.Command command) {
        var existing = sales.findByRequestId(command.requestId());
        if (existing.isPresent()) return matching(existing.get(), command.fingerprint());
        var locked = new HashMap<UUID, Product>();
        // Command lines follow canonical UUID string order. Never use UUID's signed natural ordering.
        for (var line : command.lines()) products.findByIdForUpdate(line.productId()).ifPresent(p -> locked.put(p.getId(), p));
        existing = sales.findByRequestId(command.requestId());
        if (existing.isPresent()) return matching(existing.get(), command.fingerprint());
        var priced = new ArrayList<PricedItem>();
        var shortages = new ArrayList<Shortage>();
        long total = 0;
        try {
            for (var line : command.lines()) {
                var product = locked.get(line.productId());
                if (product == null || product.getDeletedAt() != null)
                    throw new ApiException(404, "product_missing", Map.of("productId", line.productId()));
                long lineTotal = safeMoney(Math.multiplyExact(product.getSellingPriceCents(), line.quantity()));
                total = safeMoney(Math.addExact(total, lineTotal));
                priced.add(new PricedItem(product.getId(), product.getName(), line.quantity(), product.getSellingPriceCents(), lineTotal));
                if (product.getStock() < line.quantity() && !command.overrides().contains(product.getId()))
                    shortages.add(new Shortage(product.getId(), product.getName(), line.quantity(), product.getStock()));
                Math.subtractExact(product.getStock(), line.quantity());
            }
        } catch (ArithmeticException error) { throw new ApiException(422, "numeric_overflow", Map.of()); }
        if (total != command.expectedTotal()) throw new ApiException(409, "total_changed", Map.of(
                "expectedTotalCents", command.expectedTotal(), "actualTotalCents", total, "items", priced));
        if (!shortages.isEmpty()) throw new ApiException(409, "insufficient_stock", Map.of("shortages", shortages));
        if (command.method() == PaymentMethod.CASH && command.cash() < total)
            throw new ApiException(422, "cash_received_invalid", Map.of());
        var sale = new Sale(total, command.method(), command.cash(), command.requestId(), command.fingerprint());
        for (var line : command.lines()) locked.get(line.productId()).adjustStock(-line.quantity());
        sale = sales.saveAndFlush(sale);
        var savedItems = new ArrayList<SaleItem>();
        for (int i = 0; i < priced.size(); i++) {
            var line = priced.get(i);
            savedItems.add(new SaleItem(sale, locked.get(line.productId()), i, line.productName(),
                    line.quantity(), line.unitPriceCents(), line.lineTotalCents()));
        }
        items.saveAllAndFlush(savedItems);
        return new Result(SaleResponse.from(sale, savedItems), true);
    }

    private long safeMoney(long value) {
        if (value < 0 || value > MAX_SAFE_CENTS) throw new ArithmeticException();
        return value;
    }
    private SaleResponse response(Sale sale) {
        return SaleResponse.from(sale, items.findBySaleIdInOrderBySaleIdAscLineNumberAsc(List.of(sale.getId())));
    }
    private Result matching(Sale sale, String fingerprint) {
        if (!sale.getRequestFingerprint().equals(fingerprint))
            throw new ApiException(409, "request_id_reused", Map.of("requestId", sale.getRequestId()));
        return new Result(response(sale), false);
    }
    @Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED, timeout = 20)
    public Result winner(UUID requestId, String fingerprint) { return matching(find(requestId), fingerprint); }
    private Sale find(UUID requestId) {
        return sales.findByRequestId(requestId).orElseThrow(() ->
                new ApiException(404, "request_not_found", Map.of("requestId", requestId)));
    }
    @Transactional(readOnly = true, timeout = 20)
    public SaleResponse lookup(UUID requestId) { return response(find(requestId)); }
    @Transactional(readOnly = true, timeout = 20)
    public List<SaleResponse> list() {
        var rows = sales.findAllByOrderByCreatedAtDescIdAsc();
        if (rows.isEmpty()) return List.of();
        var grouped = items.findBySaleIdInOrderBySaleIdAscLineNumberAsc(rows.stream().map(Sale::getId).toList())
                .stream().collect(Collectors.groupingBy(item -> item.getSale().getId()));
        return rows.stream().map(sale -> SaleResponse.from(sale, grouped.getOrDefault(sale.getId(), List.of()))).toList();
    }
}
