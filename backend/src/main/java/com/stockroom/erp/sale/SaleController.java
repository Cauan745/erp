package com.stockroom.erp.sale;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/sales")
public class SaleController {
    private final SaleService service;
    private final SaleTransactions transactions;
    public SaleController(SaleService service, SaleTransactions transactions) {
        this.service = service; this.transactions = transactions;
    }
    @PostMapping("/checkout")
    public ResponseEntity<SaleResponse> checkout(@Valid @RequestBody CheckoutRequest request) {
        var result = service.checkout(request);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result.sale());
    }
    @GetMapping
    public List<SaleResponse> list() { return transactions.list(); }
    @GetMapping("/by-request-id/{requestId}")
    public SaleResponse lookup(@PathVariable UUID requestId) { return transactions.lookup(requestId); }
}
