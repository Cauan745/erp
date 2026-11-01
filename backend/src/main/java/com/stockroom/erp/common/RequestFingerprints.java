package com.stockroom.erp.common;

import com.stockroom.erp.sale.PaymentMethod;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/** Original submitted fields only. These hashes never include mutable database state. */
public final class RequestFingerprints {
    public static final long MAX_SAFE_CENTS = 9_007_199_254_740_991L;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private RequestFingerprints() {}

    public record Item(UUID productId, int quantity) {}

    public static String normalizeOptional(String value) {
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    public static String adjustment(UUID productId, int quantity, String reason) {
        if (productId == null || quantity == 0) throw new IllegalArgumentException("validation_failed");
        // Arrays.asList permits an explicit JSON null for the optional reason.
        return hash(java.util.Arrays.asList("stock.adjustment.v1", productId.toString(), quantity,
                normalizeOptional(reason)));
    }

    public static String checkout(Collection<Item> items, PaymentMethod paymentMethod,
            Long cashReceivedCents, long expectedTotalCents, Collection<UUID> overrides) {
        if (items == null || items.isEmpty() || paymentMethod == null || overrides == null) {
            throw new IllegalArgumentException("validation_failed");
        }
        checkMoney(expectedTotalCents);
        if (cashReceivedCents != null) checkMoney(cashReceivedCents);
        if ((paymentMethod == PaymentMethod.CASH) != (cashReceivedCents != null)) {
            throw new IllegalArgumentException("cash_received_invalid");
        }
        Map<String, Integer> merged = new TreeMap<>();
        for (Item item : items) {
            if (item == null || item.productId() == null || item.quantity() <= 0) {
                throw new IllegalArgumentException("validation_failed");
            }
            merged.merge(item.productId().toString(), item.quantity(), Math::addExact);
        }
        List<List<Object>> normalizedItems = new ArrayList<>();
        merged.forEach((id, quantity) -> normalizedItems.add(List.of(id, quantity)));
        List<String> normalizedOverrides = overrides.stream().map(id -> {
            if (id == null || !merged.containsKey(id.toString())) {
                throw new IllegalArgumentException("validation_failed");
            }
            return id.toString();
        }).distinct().sorted().toList();
        return hash(java.util.Arrays.asList("sale.checkout.v1", normalizedItems, paymentMethod.value(),
                cashReceivedCents, expectedTotalCents, normalizedOverrides));
    }

    private static void checkMoney(long value) {
        if (value < 0 || value > MAX_SAFE_CENTS) throw new IllegalArgumentException("validation_failed");
    }

    private static String hash(Object normalized) {
        String json = JSON.writeValueAsString(normalized);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(json.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
