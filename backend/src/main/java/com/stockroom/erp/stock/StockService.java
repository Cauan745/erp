package com.stockroom.erp.stock;

import com.stockroom.erp.common.ApiException;
import com.stockroom.erp.common.RequestFingerprints;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Service
public class StockService {
    private final StockTransactions transactions;
    public StockService(StockTransactions transactions) { this.transactions = transactions; }

    // Deliberately outside the transaction proxy so a unique-ID loser is fully rolled back first.
    public StockTransactions.Result adjust(UUID productId, CreateAdjustmentRequest request) {
        if (request.quantity() == 0) throw ApiException.validation("quantity", "invalid_value");
        String reason = RequestFingerprints.normalizeOptional(request.reason());
        String fingerprint = RequestFingerprints.adjustment(productId, request.quantity(), reason);
        try {
            return transactions.adjust(productId, request.requestId(), request.quantity(), reason, fingerprint);
        } catch (DataIntegrityViolationException error) {
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException constraint
                        && "stock_adjustments_request_id_unique".equals(constraint.getConstraintName())) {
                    return transactions.winner(request.requestId(), fingerprint);
                }
            }
            throw error;
        }
    }
}
