package com.stockroom.erp.common;

import java.util.List;
import java.util.Map;

public class ApiException extends RuntimeException {
    private final int status;
    private final String code;
    private final Map<String, ?> details;

    public ApiException(int status, String code, Map<String, ?> details) {
        super(code);
        this.status = status;
        this.code = code;
        this.details = details;
    }

    public int status() { return status; }
    public String code() { return code; }
    public Map<String, ?> details() { return details; }

    public static ApiException validation(String field, String code) {
        return new ApiException(400, "validation_failed", Map.of("fields", List.of(Map.of("field", field, "code", code))));
    }
}
