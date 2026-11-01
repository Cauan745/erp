package com.stockroom.erp;

import com.stockroom.erp.product.*;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ProductApiIT {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) { DatabaseFoundationIT.database(properties); }
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProductService service;
    @Autowired ProductRepository products;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    private final ConcurrentLinkedQueue<UUID> created = new ConcurrentLinkedQueue<>();

    @AfterEach
    void cleanupOwnProducts() {
        for (UUID id : created) jdbc.update("delete from products where id = ?", id);
    }

    private String unique() { return UUID.randomUUID().toString(); }
    private JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    private MvcResult postProduct(String payload) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/products").contentType("application/json").content(payload)).andReturn();
        if (result.getResponse().getStatus() == 201) created.add(UUID.fromString(body(result).get("id").asString()));
        return result;
    }
    private UUID product(int stock) throws Exception {
        MvcResult result = postProduct("{\"name\":\"" + unique() + "\",\"sellingPriceCents\":250,\"stock\":" + stock + "}");
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return UUID.fromString(body(result).get("id").asString());
    }
    private String metadata(String name) { return "{\"name\":\"" + name + "\",\"sellingPriceCents\":500}"; }

    @Test
    void crudNormalizesInputsMapsDtosAndPreservesOpeningBalanceWithoutHistory() throws Exception {
        String suffix = unique();
        MvcResult createdProduct = postProduct("{\"name\":\"  Coffee " + suffix + "  \",\"barcode\":\"  code" + suffix
                + "  \",\"category\":\"  Drinks  \",\"sellingPriceCents\":9007199254740991,\"costCents\":0,\"stock\":-5}");
        assertThat(createdProduct.getResponse().getStatus()).isEqualTo(201);
        JsonNode p = body(createdProduct);
        UUID id = UUID.fromString(p.get("id").asString());
        assertThat(p.get("name").asString()).isEqualTo("Coffee " + suffix);
        assertThat(p.get("category").asString()).isEqualTo("Drinks");
        assertThat(p.get("sellingPriceCents").asLong()).isEqualTo(9007199254740991L);
        assertThat(p.has("deletedAt")).isFalse();
        assertThat(jdbc.queryForObject("select stock from products where id=?", Integer.class, id)).isEqualTo(-5);
        assertThat(jdbc.queryForObject("select count(*) from stock_adjustments where product_id=?", Integer.class, id)).isZero();
        mvc.perform(get("/api/v1/products/by-barcode").param("barcode", " code" + suffix + " "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
        mvc.perform(patch("/api/v1/products/" + id).contentType("application/json").content(metadata(" Renamed " + suffix + " ")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.stock").value(-5))
                .andExpect(jsonPath("$.category").value("General")).andExpect(jsonPath("$.costCents").value((Object) null))
                .andExpect(jsonPath("$.barcode").value((Object) null));
        mvc.perform(delete("/api/v1/products/" + id)).andExpect(status().isNoContent()).andExpect(content().string(""));
        var deletedAt = jdbc.queryForObject("select deleted_at from products where id=?", java.time.OffsetDateTime.class, id);
        mvc.perform(delete("/api/v1/products/" + id)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select deleted_at from products where id=?", java.time.OffsetDateTime.class, id)).isEqualTo(deletedAt);
        assertThat(service.list()).extracting(ProductResponse::id).doesNotContain(id);
        mvc.perform(patch("/api/v1/products/" + id).contentType("application/json").content(metadata(unique())))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("product_missing"));
    }

    @Test
    void defaultsStockAndBlankFieldsAndRejectsTrueMisses() throws Exception {
        MvcResult result = postProduct("{\"name\":\"" + unique() + "\",\"sellingPriceCents\":0,\"barcode\":\"  \",\"category\":\"  \"}");
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        assertThat(body(result).get("stock").asInt()).isZero();
        assertThat(body(result).get("barcode").isNull()).isTrue();
        mvc.perform(get("/api/v1/products/by-barcode").param("barcode", unique()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("product_missing"));
        mvc.perform(get("/api/v1/products/by-barcode").param("barcode", "  ")).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/v1/products/" + UUID.randomUUID())).andExpect(status().isNotFound());
    }

    @Test
    void constraintsReserveAsciiNamesAndExactBarcodesAfterHidingAndFailedEditsRollback() throws Exception {
        String suffix = unique();
        MvcResult first = postProduct("{\"name\":\"Coffee" + suffix + "\",\"barcode\":\"Code" + suffix + "\",\"sellingPriceCents\":0}");
        UUID id = UUID.fromString(body(first).get("id").asString());
        UUID other = product(17);
        mvc.perform(patch("/api/v1/products/" + other).contentType("application/json").content(metadata("COFFEE" + suffix)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("product_name_taken"));
        Product unchanged = products.findById(other).orElseThrow();
        assertThat(unchanged.getStock()).isEqualTo(17);
        assertThat(unchanged.getSellingPriceCents()).isEqualTo(250);
        assertThat(unchanged.getName()).isNotEqualTo("COFFEE" + suffix);
        mvc.perform(delete("/api/v1/products/" + id)).andExpect(status().isNoContent());
        assertThat(postProduct(metadata("COFFEE" + suffix)).getResponse().getStatus()).isEqualTo(409);
        var duplicateBarcode = postProduct("{\"name\":\"" + unique() + "\",\"barcode\":\"Code" + suffix + "\",\"sellingPriceCents\":0}");
        assertThat(body(duplicateBarcode).get("error").get("code").asString()).isEqualTo("barcode_taken");
        mvc.perform(get("/api/v1/products/by-barcode").param("barcode", "Code" + suffix)).andExpect(status().isNotFound());
        assertThat(postProduct("{\"name\":\"É" + suffix + "\",\"barcode\":\"code" + suffix + "\",\"sellingPriceCents\":0}").getResponse().getStatus()).isEqualTo(201);
        assertThat(postProduct(metadata("é" + suffix)).getResponse().getStatus()).isEqualTo(201);
    }

    @Test
    void listsWithDeterministicAsciiOrderingAtTimestampTies() throws Exception {
        String suffix = unique();
        UUID z = UUID.fromString(body(postProduct(metadata("Z" + suffix))).get("id").asString());
        UUID a = UUID.fromString(body(postProduct(metadata("a" + suffix))).get("id").asString());
        jdbc.update("update products set created_at = '2099-01-01T00:00:00Z' where id in (?,?)", z, a);
        List<UUID> ids = service.list().stream().map(ProductResponse::id).toList();
        assertThat(ids.subList(0, 2)).containsExactly(a, z);
        mvc.perform(get("/api/v1/products")).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(a.toString()));
    }

    @Test
    void simultaneousCreatesReturnOneWinnerAndOneStableConflict() throws Exception {
        for (boolean collideName : List.of(true, false)) {
            String suffix = unique();
            CyclicBarrier start = new CyclicBarrier(2);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var results = pool.invokeAll(List.of(
                        () -> { start.await(); return postProduct("{\"name\":\"A" + suffix + "\",\"barcode\":\"" + suffix + "\",\"sellingPriceCents\":0}"); },
                        () -> { start.await(); return postProduct("{\"name\":\"" + (collideName ? "a" : "B") + suffix + "\",\"barcode\":\"" + (collideName ? unique() : suffix) + "\",\"sellingPriceCents\":0}"); }
                ));
                var responses = List.of((MvcResult) results.get(0).get(10, TimeUnit.SECONDS), (MvcResult) results.get(1).get(10, TimeUnit.SECONDS));
                assertThat(responses).extracting(r -> r.getResponse().getStatus()).containsExactlyInAnyOrder(201, 409);
                for (var response : responses) if (response.getResponse().getStatus() == 409) {
                    assertThat(body(response).get("error").get("code").asString()).isEqualTo(collideName ? "product_name_taken" : "barcode_taken");
                }
            }
        }
    }

    @Test
    void metadataAndDeletionWaitForInventoryLockWithoutLosingCommittedStock() throws Exception {
        for (boolean delete : List.of(false, true)) {
            UUID id = product(10);
            CountDownLatch locked = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var stockWriter = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    products.findByIdForUpdate(id).orElseThrow();
                    jdbc.update("update products set stock=7 where id=?", id);
                    em.clear(); // Direct SQL must not leave stale managed product state.
                    locked.countDown();
                    try { if (!release.await(8, TimeUnit.SECONDS)) throw new IllegalStateException("test release timed out"); }
                    catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }
                }));
                assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
                var metadataWriter = pool.submit(() -> delete
                        ? mvc.perform(delete("/api/v1/products/" + id)).andReturn()
                        : mvc.perform(patch("/api/v1/products/" + id).contentType("application/json").content(metadata(unique()))).andReturn());
                try {
                    awaitBlockedProductWriter();
                    assertThat(metadataWriter.isDone()).isFalse();
                } finally { release.countDown(); }
                stockWriter.get(10, TimeUnit.SECONDS);
                assertThat(metadataWriter.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(delete ? 204 : 200);
                assertThat(products.findById(id).orElseThrow().getStock()).isEqualTo(7);
            } finally { release.countDown(); }
        }
    }

    @Test
    void productLockTimeoutBecomesRetryableInventoryBusyAfterRollback() throws Exception {
        UUID id = product(10);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var writer = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                products.findByIdForUpdate(id).orElseThrow();
                locked.countDown();
                try { if (!release.await(12, TimeUnit.SECONDS)) throw new IllegalStateException("test release timed out"); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            try {
                mvc.perform(patch("/api/v1/products/" + id).contentType("application/json").content(metadata(unique())))
                        .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.error.code").value("inventory_busy"));
            } finally { release.countDown(); }
            writer.get(10, TimeUnit.SECONDS);
        } finally { release.countDown(); }
        assertThat(products.findById(id).orElseThrow().getStock()).isEqualTo(10);
    }

    private void awaitBlockedProductWriter() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            Integer count = jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%products%'", Integer.class);
            if (count != null && count > 0) return;
            Thread.sleep(20);
        }
        fail("Competing writer did not wait for a PostgreSQL row lock");
    }
}
