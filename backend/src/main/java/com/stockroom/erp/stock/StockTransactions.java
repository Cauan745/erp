package com.stockroom.erp.stock;

import com.stockroom.erp.common.ApiException;
import com.stockroom.erp.common.RequestFingerprints;
import com.stockroom.erp.product.ProductRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(isolation = Isolation.READ_COMMITTED, timeout = 20)
public class StockTransactions {
    public record Result(AdjustmentResponse adjustment, boolean created) {}
    private final StockAdjustmentRepository adjustments;
    private final ProductRepository products;
    private final StockHistoryQuery history;
    public StockTransactions(StockAdjustmentRepository adjustments, ProductRepository products, StockHistoryQuery history) {
        this.adjustments = adjustments; this.products = products; this.history = history;
    }

    public Result adjust(UUID productId, UUID requestId, int quantity, String reason, String fingerprint) {
        var existing = adjustments.findByRequestId(requestId);
        if (existing.isPresent()) return matching(existing.get(), fingerprint);
        var product = products.findByIdForUpdate(productId);
        // READ COMMITTED sees a winner that committed while this request waited for the lock.
        existing = adjustments.findByRequestId(requestId);
        if (existing.isPresent()) return matching(existing.get(), fingerprint);
        var locked = product.filter(p -> p.getDeletedAt() == null)
                .orElseThrow(() -> new ApiException(404, "product_missing", Map.of("productId", productId)));
        try { locked.adjustStock(quantity); }
        catch (ArithmeticException error) { throw new ApiException(422, "numeric_overflow", Map.of()); }
        var adjustment = adjustments.saveAndFlush(new StockAdjustment(locked, quantity, reason, requestId, fingerprint));
        return new Result(AdjustmentResponse.from(adjustment), true);
    }

    @Transactional(readOnly = true, isolation = Isolation.READ_COMMITTED, timeout = 20)
    public Result winner(UUID requestId, String fingerprint) {
        return matching(adjustments.findByRequestId(requestId).orElseThrow(() ->
                new ApiException(404, "request_not_found", Map.of("requestId", requestId))), fingerprint);
    }

    private Result matching(StockAdjustment adjustment, String fingerprint) {
        if (!adjustment.getRequestFingerprint().equals(fingerprint))
            throw new ApiException(409, "request_id_reused", Map.of("requestId", adjustment.getRequestId()));
        return new Result(AdjustmentResponse.from(adjustment), false);
    }

    @Transactional(readOnly = true, timeout = 20)
    public AdjustmentResponse lookup(UUID requestId) {
        return adjustments.findByRequestId(requestId).map(AdjustmentResponse::from).orElseThrow(() ->
                new ApiException(404, "request_not_found", Map.of("requestId", requestId)));
    }

    public AdjustmentResponse updateReason(UUID id, String reason) {
        if (adjustments.updateReason(id, RequestFingerprints.normalizeOptional(reason)) == 0)
            throw new ApiException(404, "adjustment_missing", Map.of("adjustmentId", id));
        // The bulk JPQL query flushes and clears; reload the DTO from current state.
        return AdjustmentResponse.from(adjustments.findById(id).orElseThrow());
    }

    @Transactional(readOnly = true, timeout = 20)
    public List<HistoryEntryResponse> history(int limit) {
        if (limit < 1 || limit > 1000) throw ApiException.validation("limit", "out_of_range");
        return history.list(limit);
    }
}
