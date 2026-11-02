package com.stockroom.erp.stock;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.stockroom.erp.common.ApiException;

public class UpdateReasonRequest {
    private String reason;
    private boolean present;
    @JsonSetter public void setReason(String reason) { this.reason = reason; present = true; }
    public String reason() {
        if (!present) throw ApiException.validation("reason", "required");
        return reason;
    }
}
