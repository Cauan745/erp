package com.stockroom.erp.stock;

import com.stockroom.erp.common.JsonConfiguration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
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

@WebMvcTest(StockController.class)
@Import(JsonConfiguration.class)
class StockControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean StockService service;
    @MockitoBean StockTransactions transactions;

    @Test void rejectsInvalidAdjustmentBodiesBeforeTransaction() throws Exception {
        String requestId = UUID.randomUUID().toString();
        for (String payload : List.of("{}", "{\"requestId\":\"bad\",\"quantity\":1}",
                "{\"requestId\":\"" + requestId + "\",\"quantity\":1,\"stock\":2}",
                "{\"requestId\":\"" + requestId + "\",\"quantity\":1,\"quantity\":2}")) {
            mvc.perform(post("/api/v1/products/" + UUID.randomUUID() + "/stock")
                    .contentType("application/json").content(payload))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("validation_failed"));
        }
        verifyNoInteractions(service, transactions);
    }

    @Test void reasonIsRequiredButExplicitNullIsAllowedAndOtherFieldsAreForbidden() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(patch("/api/v1/stock/adjustments/" + id).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/stock/adjustments/" + id).contentType("application/json").content("{\"reason\":null,\"quantity\":1}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(transactions);
        when(transactions.updateReason(id, null)).thenReturn(new AdjustmentResponse(id, UUID.randomUUID(), UUID.randomUUID(), 1, null, Instant.now()));
        mvc.perform(patch("/api/v1/stock/adjustments/" + id).contentType("application/json").content("{\"reason\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reason").value((Object)null));
    }

    @Test void distinguishesCreatedAndRepeatedResponsesAndKeepsEmptyHistoryAnArray() throws Exception {
        UUID product = UUID.randomUUID(), request = UUID.randomUUID();
        var response = new AdjustmentResponse(UUID.randomUUID(), request, product, 1, null, Instant.now());
        when(service.adjust(eq(product), any())).thenReturn(new StockTransactions.Result(response, true), new StockTransactions.Result(response, false));
        String payload = "{\"requestId\":\"" + request + "\",\"quantity\":1}";
        mvc.perform(post("/api/v1/products/" + product + "/stock").contentType("application/json").content(payload))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.requestId").value(request.toString()));
        mvc.perform(post("/api/v1/products/" + product + "/stock").contentType("application/json").content(payload))
                .andExpect(status().isOk());
        when(transactions.history(50)).thenReturn(List.of());
        mvc.perform(get("/api/v1/stock/history")).andExpect(status().isOk()).andExpect(content().json("[]"));
    }
}
