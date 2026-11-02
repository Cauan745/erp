package com.stockroom.erp.sale;

import com.stockroom.erp.common.ApiException;
import com.stockroom.erp.common.RequestFingerprints;
import java.util.*;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Service
public class SaleService {
    public record Line(UUID productId, int quantity) {}
    public record Command(UUID requestId, List<Line> lines, PaymentMethod method, Long cash,
            long expectedTotal, Set<UUID> overrides, String fingerprint) {}
    private final SaleTransactions transactions;
    public SaleService(SaleTransactions transactions) { this.transactions = transactions; }

    public SaleTransactions.Result checkout(CheckoutRequest request) {
        var command = normalize(request);
        // Catch outside the transaction proxy: every losing write has rolled back before reading the winner.
        try { return transactions.checkout(command); }
        catch (DataIntegrityViolationException error) {
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof ConstraintViolationException constraint
                        && "sales_request_id_unique".equals(constraint.getConstraintName()))
                    return transactions.winner(command.requestId(), command.fingerprint());
            }
            throw error;
        }
    }

    private Command normalize(CheckoutRequest request) {
        if (request.requestId() == null || request.items() == null || request.items().isEmpty()
                || request.expectedTotalCents() == null || request.overrides() == null)
            throw ApiException.validation("body", "required");
        PaymentMethod method;
        try { method = PaymentMethod.fromValue(request.paymentMethod()); }
        catch (IllegalArgumentException error) { throw ApiException.validation("paymentMethod", "invalid_value"); }
        var merged = new TreeMap<String, Integer>();
        try {
            for (var item : request.items()) {
                if (item == null || item.productId() == null || item.quantity() == null || item.quantity() <= 0)
                    throw ApiException.validation("items", "invalid_value");
                merged.merge(item.productId().toString(), item.quantity(), Math::addExact);
            }
        } catch (ArithmeticException error) { throw new ApiException(422, "numeric_overflow", Map.of()); }
        var lines = merged.entrySet().stream().map(e -> new Line(UUID.fromString(e.getKey()), e.getValue())).toList();
        String fingerprint;
        try {
            fingerprint = RequestFingerprints.checkout(lines.stream()
                    .map(l -> new RequestFingerprints.Item(l.productId(), l.quantity())).toList(), method,
                    request.cashReceivedCents(), request.expectedTotalCents(), request.overrides());
        } catch (IllegalArgumentException error) {
            if ("cash_received_invalid".equals(error.getMessage()))
                throw new ApiException(422, "cash_received_invalid", Map.of());
            throw ApiException.validation("body", "invalid_value");
        }
        return new Command(request.requestId(), lines, method, request.cashReceivedCents(),
                request.expectedTotalCents(), Set.copyOf(request.overrides()), fingerprint);
    }
}
