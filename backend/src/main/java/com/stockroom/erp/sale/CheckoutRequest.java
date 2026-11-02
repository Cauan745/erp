package com.stockroom.erp.sale;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;
import static com.stockroom.erp.common.RequestFingerprints.MAX_SAFE_CENTS;

public class CheckoutRequest {
    public record Item(@NotNull UUID productId, @NotNull @Min(1) Integer quantity) {}
    @JsonProperty @NotNull private UUID requestId;
    @JsonProperty @NotEmpty private List<@NotNull @Valid Item> items;
    @JsonProperty @NotNull private String paymentMethod;
    @JsonProperty @Min(0) @Max(MAX_SAFE_CENTS) private Long cashReceivedCents;
    @JsonProperty @NotNull @Min(0) @Max(MAX_SAFE_CENTS) private Long expectedTotalCents;
    @JsonProperty @JsonSetter(nulls = Nulls.FAIL) private List<@NotNull UUID> allowInsufficientStockProductIds = List.of();
    public UUID requestId() { return requestId; }
    public List<Item> items() { return items; }
    public String paymentMethod() { return paymentMethod; }
    public Long cashReceivedCents() { return cashReceivedCents; }
    public Long expectedTotalCents() { return expectedTotalCents; }
    public List<UUID> overrides() { return allowInsufficientStockProductIds; }
}
