package com.stockroom.erp.stock;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class CreateAdjustmentRequest {
    @JsonProperty @NotNull private UUID requestId;
    @JsonProperty @NotNull private Integer quantity;
    @JsonProperty @JsonSetter(nulls = Nulls.FAIL) private String reason;
    public UUID requestId() { return requestId; }
    public Integer quantity() { return quantity; }
    public String reason() { return reason; }
}
