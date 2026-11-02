package com.stockroom.erp.sale;

import com.stockroom.erp.common.JsonConfiguration;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SaleController.class)
@Import(JsonConfiguration.class)
class SaleControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean SaleService service;
    @MockitoBean SaleTransactions transactions;
    private String valid() {
        return "{\"requestId\":\"" + UUID.randomUUID() + "\",\"items\":[{\"productId\":\""
                + UUID.randomUUID() + "\",\"quantity\":1}],\"paymentMethod\":\"pix\",\"expectedTotalCents\":250}";
    }
    @Test void strictCheckoutBindingRejectsInvalidTypesNullsUnknownAndMissingFields() throws Exception {
        String body = valid();
        for (String invalid : List.of("{}", body.replace("\"quantity\":1", "\"quantity\":1.5"),
                body.replace("\"quantity\":1", "\"quantity\":\"1\""), body.replace("\"quantity\":1", "\"quantity\":null"),
                body.replace("\"quantity\":1", "\"quantity\":0"), body.replace("\"quantity\":1", "\"quantity\":2147483648"),
                body.replace("\"expectedTotalCents\":250", "\"expectedTotalCents\":null"),
                body.replace("\"expectedTotalCents\":250", "\"expectedTotalCents\":9007199254740992"),
                body.replace("\"expectedTotalCents\":250", "\"expectedTotalCents\":250,\"allowInsufficientStockProductIds\":null"),
                body.replace("\"quantity\":1", "\"quantity\":1,\"unitPriceCents\":1"),
                body.replace("\"quantity\":1", "\"quantity\":1,\"quantity\":2"))) {
            mvc.perform(post("/api/v1/sales/checkout").contentType("application/json").content(invalid))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("validation_failed"));
        }
        verifyNoInteractions(service, transactions);
    }
    @Test void createdDuplicateAndReadResponsesUseOnlyDtos() throws Exception {
        UUID requestId = UUID.randomUUID();
        var sale = new SaleResponse(UUID.randomUUID(), requestId, 250, "pix", null, null, Instant.now(), List.of());
        when(service.checkout(any())).thenReturn(new SaleTransactions.Result(sale, true), new SaleTransactions.Result(sale, false));
        mvc.perform(post("/api/v1/sales/checkout").contentType("application/json").content(valid()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.requestId").value(requestId.toString()));
        mvc.perform(post("/api/v1/sales/checkout").contentType("application/json").content(valid())).andExpect(status().isOk());
        when(transactions.list()).thenReturn(List.of());
        mvc.perform(get("/api/v1/sales")).andExpect(status().isOk()).andExpect(content().json("[]"));
        when(transactions.lookup(requestId)).thenReturn(sale);
        mvc.perform(get("/api/v1/sales/by-request-id/" + requestId)).andExpect(status().isOk());
    }
}
