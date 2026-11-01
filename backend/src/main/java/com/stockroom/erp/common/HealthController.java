package com.stockroom.erp.common;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    public record HealthResponse(String status) {}

    @GetMapping("/healthz")
    public HealthResponse health() {
        return new HealthResponse("ok");
    }
}
