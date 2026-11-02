package com.stockroom.erp;

import com.stockroom.erp.common.ApiException;
import com.stockroom.erp.product.*;
import com.stockroom.erp.stock.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
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
class StockApiIT {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) { DatabaseFoundationIT.database(properties); }
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProductRepository products;
    @Autowired ProductService productService;
    @Autowired StockService service;
    @Autowired StockTransactions stock;
    @Autowired PlatformTransactionManager transactions;
    private final List<UUID> created = new ArrayList<>();
    private final List<UUID> sales = new ArrayList<>();

    @AfterEach void cleanup() {
        for (UUID id : sales) {
            jdbc.update("delete from sale_items where sale_id=?", id);
            jdbc.update("delete from sales where id=?", id);
        }
        for (UUID id : created) {
            jdbc.update("delete from stock_adjustments where product_id=?", id);
            jdbc.update("delete from products where id=?", id);
        }
    }
    private UUID product(int balance) {
        var p = products.saveAndFlush(new Product(UUID.randomUUID().toString(), null, "General", null, 250, balance));
        created.add(p.getId()); return p.getId();
    }
    private String payload(UUID request, int quantity, String reason) {
        return json.writeValueAsString(Map.of("requestId", request, "quantity", quantity, "reason", reason));
    }
    private CreateAdjustmentRequest request(UUID id, int quantity) {
        return json.readValue(payload(id, quantity, "test"), CreateAdjustmentRequest.class);
    }
    private MvcResult adjust(UUID id, UUID request, int quantity, String reason) throws Exception {
        return mvc.perform(post("/api/v1/products/" + id + "/stock").contentType("application/json")
                .content(payload(request, quantity, reason))).andReturn();
    }
    private JsonNode body(MvcResult r) throws Exception { return json.readTree(r.getResponse().getContentAsString()); }
    private int balance(UUID id) { return products.findById(id).orElseThrow().getStock(); }

    @Test void adjustmentsMapDtosAndSignedStockWithoutSyntheticOpeningHistory() throws Exception {
        UUID id = product(10), request = UUID.randomUUID();
        assertThat(stock.history(1000)).noneMatch(h -> h.productId().equals(id));
        var first = adjust(id, request, 2, "  Delivery  ");
        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        var a = body(first);
        assertThat(a.get("reason").asString()).isEqualTo("Delivery");
        assertThat(a.has("requestFingerprint")).isFalse();
        assertThat(a.has("product")).isFalse();
        assertThat(balance(id)).isEqualTo(12);
        var retry = adjust(id, request, 2, "Delivery");
        assertThat(retry.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(retry)).isEqualTo(a);
        assertThat(adjust(id, UUID.randomUUID(), -20, "  ").getResponse().getStatus()).isEqualTo(201);
        assertThat(balance(id)).isEqualTo(-8);
        var rows = stock.history(1000).stream().filter(h -> h.productId().equals(id)).toList();
        assertThat(rows).hasSize(2);
        assertThat(rows.getFirst().reason()).isNull();
        mvc.perform(get("/api/v1/stock/adjustments/by-request-id/" + request)).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(a.get("id").asString()));
        mvc.perform(get("/api/v1/stock/adjustments/by-request-id/" + UUID.randomUUID()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("request_not_found"));
    }

    @Test void reasonOnlyEditAfterDeletionPreservesOriginalIdentityAndStock() throws Exception {
        UUID id = product(1), request = UUID.randomUUID();
        JsonNode original = body(adjust(id, request, 3, "sale-shortage-replenishment"));
        UUID adjustment = UUID.fromString(original.get("id").asString());
        Map<String, Object> before = jdbc.queryForMap("select * from stock_adjustments where id=?", adjustment);
        productService.delete(id);
        mvc.perform(patch("/api/v1/stock/adjustments/" + adjustment).contentType("application/json").content("{\"reason\":\"  Corrected  \"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reason").value("Corrected"));
        Map<String, Object> after = jdbc.queryForMap("select * from stock_adjustments where id=?", adjustment);
        before.remove("reason"); after.remove("reason");
        assertThat(after).isEqualTo(before);
        assertThat(balance(id)).isEqualTo(4);
        assertThat(adjust(id, request, 3, "sale-shortage-replenishment").getResponse().getStatus()).isEqualTo(200);
        assertThat(stock.lookup(request).reason()).isEqualTo("Corrected");
        assertThat(adjust(id, request, 3, "Corrected").getResponse().getStatus()).isEqualTo(409);
        assertThat(adjust(id, UUID.randomUUID(), 1, "test").getResponse().getStatus()).isEqualTo(404);
        mvc.perform(patch("/api/v1/stock/adjustments/" + adjustment).contentType("application/json").content("{\"reason\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reason").value((Object)null));
        mvc.perform(patch("/api/v1/stock/adjustments/" + UUID.randomUUID()).contentType("application/json").content("{\"reason\":null}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("adjustment_missing"));
    }

    @Test void invalidInputsAndOverflowLeaveNoBusinessRowsOrStockChanges() throws Exception {
        UUID id = product(Integer.MAX_VALUE);
        var overflow = adjust(id, UUID.randomUUID(), 1, "test");
        assertThat(overflow.getResponse().getStatus()).isEqualTo(422);
        assertThat(body(overflow).get("error").get("code").asString()).isEqualTo("numeric_overflow");
        UUID low = product(Integer.MIN_VALUE);
        assertThat(adjust(low, UUID.randomUUID(), -1, "test").getResponse().getStatus()).isEqualTo(422);
        assertThat(balance(low)).isEqualTo(Integer.MIN_VALUE);
        for (String q : List.of("0", "1.5", "\"1\"", "null", "2147483648")) {
            mvc.perform(post("/api/v1/products/" + id + "/stock").contentType("application/json")
                    .content("{\"requestId\":\"" + UUID.randomUUID() + "\",\"quantity\":" + q + "}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/api/v1/products/" + id + "/stock").contentType("application/json").content("{\"quantity\":1}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/products/" + id + "/stock").contentType("application/json")
                .content("{\"requestId\":\"" + UUID.randomUUID() + "\",\"quantity\":1,\"reason\":null}"))
                .andExpect(status().isBadRequest());
        for (String payload : List.of("{}", "{\"reason\":1}", "{\"reason\":null,\"quantity\":3}")) {
            mvc.perform(patch("/api/v1/stock/adjustments/" + UUID.randomUUID()).contentType("application/json").content(payload))
                    .andExpect(status().isBadRequest());
        }
        assertThat(balance(id)).isEqualTo(Integer.MAX_VALUE);
        assertThat(jdbc.queryForObject("select count(*) from stock_adjustments where product_id in (?,?)", Integer.class, id, low)).isZero();
        for (String limit : List.of("0", "1001", "-1", "1.5", "x"))
            mvc.perform(get("/api/v1/stock/history").param("limit", limit)).andExpect(status().isBadRequest());
    }

    @Test void unionHistoryUsesSaleSnapshotsAndCurrentHiddenProductNamesAndStableTies() throws Exception {
        UUID id = product(5), request = UUID.randomUUID();
        var adjustment = body(adjust(id, request, 2, "test"));
        UUID sale = UUID.randomUUID(), item = UUID.randomUUID(); sales.add(sale);
        jdbc.update("insert into sales(id,total_cents,payment_method,created_at,request_id,request_fingerprint) values (?,500,'pix','2099-01-01Z',?,?)", sale, UUID.randomUUID(), "a".repeat(64));
        jdbc.update("insert into sale_items(id,sale_id,product_id,line_number,product_name,quantity,unit_price_cents,line_total_cents) values (?,?,?,0,'Original name',2,250,500)", item, sale, id);
        jdbc.update("update stock_adjustments set created_at='2099-01-01Z' where request_id=?", request);
        jdbc.update("update products set name='Renamed ' || id, deleted_at=now() where id=?", id);
        var history = stock.history(2);
        assertThat(history).hasSize(2);
        assertThat(history.getFirst().id().toString()).isEqualTo(adjustment.get("id").asString());
        assertThat(history.getFirst().productName()).startsWith("Renamed ");
        assertThat(history.get(1).id()).isEqualTo(item);
        assertThat(history.get(1).productName()).isEqualTo("Original name");
        assertThat(history.get(1).quantity()).isEqualTo(-2);
        assertThat(history.get(1).reason()).isEqualTo("Sale");
        mvc.perform(get("/api/v1/stock/history").param("limit", "1")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }

    @Test void concurrentSignedAdjustmentsSerializeWithoutLosingUpdates() throws Exception {
        UUID id = product(10);
        CountDownLatch changed = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.adjust(id, request(UUID.randomUUID(), 5));
                changed.countDown(); await(release); return result;
            }));
            assertThat(changed.await(5, TimeUnit.SECONDS)).isTrue();
            var b = pool.submit(() -> service.adjust(id, request(UUID.randomUUID(), -3)));
            try { awaitBlocked("products"); assertThat(b.isDone()).isFalse(); }
            finally { release.countDown(); }
            assertThat(a.get(10, TimeUnit.SECONDS).created()).isTrue();
            assertThat(b.get(10, TimeUnit.SECONDS).created()).isTrue();
        } finally { release.countDown(); }
        assertThat(balance(id)).isEqualTo(12);
        assertThat(stock.history(1000)).filteredOn(row -> row.productId().equals(id)).hasSize(2);
    }

    @Test void adjustmentInsertFailureRollsBackManagedStockAndTimestamp() {
        UUID id = product(10), requestId = UUID.randomUUID();
        var before = jdbc.queryForMap("select stock, updated_at from products where id=?", id);
        jdbc.execute("alter table stock_adjustments add constraint test_reject_adjustment_product check (product_id <> '" + id + "'::uuid) not valid");
        try {
            assertThatThrownBy(() -> service.adjust(id, request(requestId, 3)))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        } finally { jdbc.execute("alter table stock_adjustments drop constraint test_reject_adjustment_product"); }
        assertThat(jdbc.queryForMap("select stock, updated_at from products where id=?", id)).isEqualTo(before);
        assertThat(stock.history(1000)).noneMatch(row -> row.productId().equals(id));
        assertThatThrownBy(() -> stock.lookup(requestId)).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.code()).isEqualTo("request_not_found"));
    }

    @Test void duplicateWaitsThenReturnsCommittedWinnerEvenAfterProductHidden() throws Exception {
        UUID id = product(1), requestId = UUID.randomUUID();
        var request = request(requestId, -1);
        CountDownLatch inserted = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var original = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.adjust(id, request);
                productService.delete(id);
                inserted.countDown(); await(release); return result;
            }));
            assertThat(inserted.await(5, TimeUnit.SECONDS)).isTrue();
            // Another connection cannot see the uncommitted POST. A miss is not cancellation.
            mvc.perform(get("/api/v1/stock/adjustments/by-request-id/" + requestId))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("request_not_found"));
            var duplicate = pool.submit(() -> service.adjust(id, request));
            try { awaitBlocked("products"); assertThat(duplicate.isDone()).isFalse(); }
            finally { release.countDown(); }
            assertThat(duplicate.get(10, TimeUnit.SECONDS).adjustment()).isEqualTo(original.get(10, TimeUnit.SECONDS).adjustment());
            assertThat(stock.lookup(requestId)).isEqualTo(original.get(10, TimeUnit.SECONDS).adjustment());
            assertThat(balance(id)).isZero();
        } finally { release.countDown(); }
    }

    @Test void uniqueIdRaceAcrossDifferentProductsRollsBackLoserBeforeComparingWinner() throws Exception {
        UUID a = product(10), b = product(20), requestId = UUID.randomUUID();
        CountDownLatch inserted = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var winner = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.adjust(a, request(requestId, 2));
                inserted.countDown(); await(release); return result;
            }));
            assertThat(inserted.await(5, TimeUnit.SECONDS)).isTrue();
            var loser = pool.submit(() -> service.adjust(b, request(requestId, 3)));
            try { awaitBlocked("stock_adjustments"); assertThat(loser.isDone()).isFalse(); }
            finally { release.countDown(); }
            assertThat(winner.get(10, TimeUnit.SECONDS).created()).isTrue();
            assertThatThrownBy(() -> loser.get(10, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .cause().isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.code()).isEqualTo("request_id_reused"));
        } finally { release.countDown(); }
        assertThat(balance(a)).isEqualTo(12);
        assertThat(balance(b)).isEqualTo(20);
        assertThat(jdbc.queryForObject("select count(*) from stock_adjustments where request_id=?", Integer.class, requestId)).isEqualTo(1);
    }

    @Test void committedAdjustmentLookupSurvivesAnotherApplicationStartup() {
        UUID id = product(10), requestId = UUID.randomUUID();
        var saved = service.adjust(id, request(requestId, 2)).adjustment();
        try (var restarted = new SpringApplicationBuilder(StockroomApplication.class)
                .web(WebApplicationType.NONE).run(
                        "--spring.datasource.url=" + System.getenv("TEST_DATABASE_URL"),
                        "--spring.datasource.username=" + System.getenv().getOrDefault("TEST_DATABASE_USERNAME", "stockroom"),
                        "--spring.datasource.password=" + System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "stockroom_dev"))) {
            assertThat(restarted.getBean(StockTransactions.class).lookup(requestId)).isEqualTo(saved);
            assertThat(restarted.getBean(ProductRepository.class).findById(id).orElseThrow().getStock()).isEqualTo(12);
        }
    }

    @Test void adjustmentLockTimeoutLeavesStockAndHistoryUnchanged() throws Exception {
        UUID id = product(10), requestId = UUID.randomUUID();
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var blocker = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                products.findByIdForUpdate(id).orElseThrow(); locked.countDown(); await(release);
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            try {
                var response = adjust(id, requestId, 2, "test");
                assertThat(response.getResponse().getStatus()).isEqualTo(503);
                assertThat(body(response).get("error").get("code").asString()).isEqualTo("inventory_busy");
            } finally { release.countDown(); }
            blocker.get(10, TimeUnit.SECONDS);
        } finally { release.countDown(); }
        assertThat(balance(id)).isEqualTo(10);
        assertThatThrownBy(() -> stock.lookup(requestId)).isInstanceOf(ApiException.class);
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(12, TimeUnit.SECONDS)) throw new IllegalStateException("Latch timed out"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }
    }
    private void awaitBlocked(String table) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            Integer count = jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and pid <> pg_backend_pid() and cardinality(pg_blocking_pids(pid)) > 0 and wait_event_type='Lock' and query like ?", Integer.class, "%" + table + "%");
            if (count != null && count > 0) return;
            Thread.sleep(20);
        }
        fail("No competing PostgreSQL lock wait for " + table);
    }
}
