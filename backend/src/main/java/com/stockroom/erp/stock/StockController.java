package com.stockroom.erp.stock;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class StockController {
    private final StockService service;
    private final StockTransactions transactions;
    public StockController(StockService service, StockTransactions transactions) {
        this.service = service; this.transactions = transactions;
    }
    @PostMapping("/products/{id}/stock")
    public ResponseEntity<AdjustmentResponse> adjust(@PathVariable UUID id, @Valid @RequestBody CreateAdjustmentRequest request) {
        var result = service.adjust(id, request);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result.adjustment());
    }
    @GetMapping("/stock/adjustments/by-request-id/{requestId}")
    public AdjustmentResponse lookup(@PathVariable UUID requestId) { return transactions.lookup(requestId); }
    @PatchMapping("/stock/adjustments/{id}")
    public AdjustmentResponse reason(@PathVariable UUID id, @RequestBody UpdateReasonRequest request) {
        return transactions.updateReason(id, request.reason());
    }
    @GetMapping("/stock/history")
    public List<HistoryEntryResponse> history(@RequestParam(defaultValue = "50") int limit) { return transactions.history(limit); }
}
