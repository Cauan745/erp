package com.stockroom.erp.product;

import com.stockroom.erp.common.JsonConfiguration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProductController.class)
@Import(JsonConfiguration.class)
class ProductControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ProductService products;

    @Test
    void acceptsOmittedOptionalsAndExplicitNullableCost() throws Exception {
        var now = Instant.now();
        when(products.create(any())).thenReturn(new ProductResponse(UUID.randomUUID(), "Coffee", null,
                "General", null, 250, 0, now, now));
        mvc.perform(post("/api/v1/products").contentType("application/json")
                        .content("{\"name\":\"Coffee\",\"sellingPriceCents\":250,\"costCents\":null}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.sellingPriceCents").value(250))
                .andExpect(jsonPath("$.deletedAt").doesNotExist()).andExpect(jsonPath("$.version").doesNotExist());
    }

    @Test
    void rejectsMissingRequiredAndUnsafeValuesBeforeCallingService() throws Exception {
        for (String body : new String[]{
                "{}", "{\"name\":\" \",\"sellingPriceCents\":0}",
                "{\"name\":\"Coffee\",\"sellingPriceCents\":null}",
                "{\"name\":\"Coffee\",\"sellingPriceCents\":-1}",
                "{\"name\":\"Coffee\",\"sellingPriceCents\":9007199254740992}",
                "{\"name\":\"Coffee\",\"sellingPriceCents\":0,\"costCents\":-1}",
                "{\"name\":\"Coffee\",\"sellingPriceCents\":0,\"costCents\":9007199254740992}"}) {
            mvc.perform(post("/api/v1/products").contentType("application/json").content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("validation_failed"));
        }
        verifyNoInteractions(products);
    }

    @Test
    void rejectsNumericStringsFractionsWrongTypesAndExplicitNullOptionals() throws Exception {
        for (String fragment : new String[]{
                "\"sellingPriceCents\":\"12\"", "\"sellingPriceCents\":12.0", "\"sellingPriceCents\":true",
                "\"sellingPriceCents\":0,\"stock\":1.5", "\"sellingPriceCents\":0,\"stock\":\"1\"",
                "\"sellingPriceCents\":0,\"stock\":2147483648", "\"sellingPriceCents\":0,\"stock\":null",
                "\"sellingPriceCents\":0,\"category\":null", "\"sellingPriceCents\":0,\"barcode\":null",
                "\"sellingPriceCents\":0,\"costCents\":\"1\"", "\"sellingPriceCents\":0,\"category\":12"}) {
            mvc.perform(post("/api/v1/products").contentType("application/json").content("{\"name\":\"Coffee\"," + fragment + "}"))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("validation_failed"));
        }
        mvc.perform(post("/api/v1/products").contentType("application/json").content("{\"name\":12,\"sellingPriceCents\":0}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(products);
    }

    @Test
    void metadataForbidsStockAndUnknownFields() throws Exception {
        mvc.perform(patch("/api/v1/products/" + UUID.randomUUID()).contentType("application/json")
                        .content("{\"name\":\"Coffee\",\"sellingPriceCents\":0,\"stock\":42}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.details.fields[0].field").value("stock"))
                .andExpect(jsonPath("$.error.details.fields[0].code").value("unknown_field"));
        verifyNoInteractions(products);
    }

    @Test
    void rejectsMalformedIdsMissingBarcodeAndDuplicateJsonFields() throws Exception {
        mvc.perform(delete("/api/v1/products/not-a-uuid")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/products/by-barcode")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/products").contentType("application/json")
                        .content("{\"name\":\"Coffee\",\"name\":\"Other\",\"sellingPriceCents\":0}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(products);
    }
}
