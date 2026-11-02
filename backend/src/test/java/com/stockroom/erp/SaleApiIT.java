package com.stockroom.erp;

import com.stockroom.erp.common.*;
import com.stockroom.erp.product.*;
import com.stockroom.erp.sale.*;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SaleApiIT {
    @DynamicPropertySource static void database(DynamicPropertyRegistry p) { DatabaseFoundationIT.database(p); }
    @Autowired jakarta.persistence.EntityManagerFactory entityManagerFactory;
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired ProductRepository products;
    @Autowired ProductService productService;
    @Autowired SaleService service;
    @Autowired SaleTransactions sales;
    @Autowired StockService stock;
    @Autowired StockTransactions stockTransactions;
    @Autowired PlatformTransactionManager transactions;
    private final List<UUID> created = new ArrayList<>();
    @AfterEach void cleanup() {
        for (UUID id : created) {
            var saleIds = jdbc.queryForList("select distinct sale_id from sale_items where product_id=?", UUID.class, id);
            for (UUID sale : saleIds) {
                jdbc.update("delete from sale_items where sale_id=?", sale);
                jdbc.update("delete from sales where id=?", sale);
            }
            jdbc.update("delete from stock_adjustments where product_id=?", id);
            jdbc.update("delete from products where id=?", id);
        }
    }
    private UUID product(int balance) { return product(balance, 250); }
    private UUID product(int balance, long price) {
        var p = products.saveAndFlush(new Product(UUID.randomUUID().toString(), null, "General", null, price, balance));
        created.add(p.getId()); return p.getId();
    }
    private int balance(UUID id) { return products.findById(id).orElseThrow().getStock(); }
    private Map<String, Object> item(UUID id, int quantity) { return Map.of("productId", id, "quantity", quantity); }
    private CheckoutRequest request(UUID request, List<Map<String, Object>> items, String method, Long cash, long total, List<UUID> overrides) {
        var body = new HashMap<String, Object>();
        body.put("requestId", request); body.put("items", items); body.put("paymentMethod", method);
        body.put("cashReceivedCents", cash); body.put("expectedTotalCents", total); body.put("allowInsufficientStockProductIds", overrides);
        return json.readValue(json.writeValueAsString(body), CheckoutRequest.class);
    }
    private CheckoutRequest request(UUID request, UUID id, int quantity) {
        return request(request, List.of(item(id, quantity)), "pix", null, 250L * quantity, List.of());
    }
    private JsonNode post(CheckoutRequest request, int status) throws Exception {
        // Request DTO uses field annotations, not entity serialization.
        var result = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/sales/checkout").contentType("application/json").content(json.writeValueAsString(request)))
                .andExpect(status().is(status)).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }
    @Test void paymentsDtosSnapshotsAndCompleteReadsSurviveCatalogChanges() throws Exception {
        UUID a = product(20), b = product(20);
        String oldName = products.findById(a).orElseThrow().getName();
        var ids = new ArrayList<UUID>();
        for (String method : List.of("cash", "debit_card", "credit_card", "pix")) {
            UUID requestId = UUID.randomUUID(); ids.add(requestId);
            var body = post(request(requestId, List.of(item(b, 1), item(a, 2)), method,
                    method.equals("cash") ? 1000L : null, 750, List.of()), 201);
            assertThat(body.get("totalCents").asLong()).isEqualTo(750);
            assertThat(body.get("changeCents").isNull()).isEqualTo(!method.equals("cash"));
            if (method.equals("cash")) assertThat(body.get("changeCents").asLong()).isEqualTo(250);
            assertThat(body.has("requestFingerprint")).isFalse();
            assertThat(body.get("items").get(0).get("lineNumber").asInt()).isZero();
            assertThat(body.get("items").get(0).get("productId").asString()).isEqualTo(List.of(a.toString(), b.toString()).stream().sorted().findFirst().orElseThrow());
            assertThat(body.get("items").get(0).has("product")).isFalse();
        }
        productService.update(a, json.readValue("{\"name\":\"Renamed " + a + "\",\"sellingPriceCents\":900}", UpdateProductRequest.class));
        productService.delete(a);
        for (UUID id : ids) {
            var saved = sales.lookup(id);
            assertThat(saved.items()).filteredOn(i -> i.productId().equals(a)).singleElement().satisfies(i -> {
                assertThat(i.productName()).isEqualTo(oldName); assertThat(i.unitPriceCents()).isEqualTo(250);
                assertThat(i.lineTotalCents()).isEqualTo(500);
            });
            assertThat(sales.list()).contains(saved);
        }
        assertThat(stockTransactions.history(1000)).filteredOn(row -> row.productId().equals(a))
                .hasSize(4).allSatisfy(row -> {
                    assertThat(row.source()).isEqualTo("sale"); assertThat(row.quantity()).isEqualTo(-2);
                    assertThat(row.productName()).isEqualTo(oldName);
                });
        assertThat(balance(a)).isEqualTo(12); assertThat(balance(b)).isEqualTo(16);
        mvc.perform(get("/api/v1/sales")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/sales/by-request-id/" + UUID.randomUUID()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("request_not_found"));
    }
    @Test void completeSalesReadUsesTwoQueriesAndIndependentSavedLineTotals() {
        UUID id = product(10);
        var saved = service.checkout(request(UUID.randomUUID(), id, 2)).sale();
        jdbc.update("update sale_items set unit_price_cents=200 where sale_id=?", saved.id());
        var statistics = entityManagerFactory.unwrap(org.hibernate.SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();
        try {
            var result = sales.list();
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
            assertThat(result).filteredOn(sale -> sale.id().equals(saved.id())).singleElement().satisfies(sale -> {
                assertThat(sale.items().getFirst().unitPriceCents()).isEqualTo(200);
                assertThat(sale.items().getFirst().lineTotalCents()).isEqualTo(500);
            });
        } finally { statistics.setStatisticsEnabled(false); }
    }
    @Test void normalizedDuplicatesReturnOriginalBeforeCurrentPricesStockAndDeletion() throws Exception {
        UUID a = product(1), b = product(1), id = UUID.randomUUID();
        var first = request(id, List.of(item(b, 1), item(a, 1), item(a, 1)), "cash", 1000L, 750, List.of(a, a));
        var saved = post(first, 201);
        assertThat(balance(a)).isEqualTo(-1);
        productService.delete(a);
        productService.update(b, json.readValue("{\"name\":\"Changed " + b + "\",\"sellingPriceCents\":999}", UpdateProductRequest.class));
        var duplicate = request(id, List.of(item(a, 2), item(b, 1)), "cash", 1000L, 750, List.of(a));
        assertThat(post(duplicate, 200)).isEqualTo(saved);
        assertThat(post(request(id, List.of(item(a, 2), item(b, 1)), "cash", 1001L, 750, List.of(a)), 409)
                .get("error").get("code").asString()).isEqualTo("request_id_reused");
        assertThat(balance(a)).isEqualTo(-1); assertThat(balance(b)).isZero();
    }
    @Test void shortagesAreSortedAndMultiProductCheckoutRollsBackThenExplicitOverridesPermitNegativeStock() throws Exception {
        UUID a = product(0), b = product(-1), good = product(10), requestId = UUID.randomUUID();
        var input = List.of(item(b, 2), item(good, 1), item(a, 1));
        var error = post(request(requestId, input, "pix", null, 1000, List.of()), 409).get("error");
        assertThat(error.get("code").asString()).isEqualTo("insufficient_stock");
        assertThat(error.get("details").get("shortages").size()).isEqualTo(2);
        assertThat(error.get("details").get("shortages").get(0).get("productId").asString())
                .isEqualTo(List.of(a.toString(), b.toString()).stream().sorted().findFirst().orElseThrow());
        assertThat(balance(good)).isEqualTo(10); assertMissing(requestId);
        post(request(UUID.randomUUID(), input, "pix", null, 1000, List.of(a)), 409);
        post(request(UUID.randomUUID(), input, "pix", null, 1000, List.of(a, b)), 201);
        assertThat(balance(a)).isEqualTo(-1); assertThat(balance(b)).isEqualTo(-3); assertThat(balance(good)).isEqualTo(9);
    }
    @Test void priceReviewAndPaymentRejectionsHaveNoSideEffects() throws Exception {
        UUID a = product(10), requestId = UUID.randomUUID();
        var conflict = post(request(requestId, List.of(item(a, 2)), "cash", 1000L, 400, List.of()), 409).get("error");
        assertThat(conflict.get("code").asString()).isEqualTo("total_changed");
        assertThat(conflict.get("details").get("actualTotalCents").asLong()).isEqualTo(500);
        assertThat(conflict.get("details").get("items").get(0).get("unitPriceCents").asLong()).isEqualTo(250);
        for (var r : List.of(request(UUID.randomUUID(), List.of(item(a, 2)), "cash", 499L, 500, List.of()),
                request(UUID.randomUUID(), List.of(item(a, 2)), "cash", null, 500, List.of()),
                request(UUID.randomUUID(), List.of(item(a, 2)), "pix", 500L, 500, List.of()))) {
            assertThat(post(r, 422).get("error").get("code").asString()).isEqualTo("cash_received_invalid");
            assertMissing(r.requestId());
        }
        post(request(UUID.randomUUID(), List.of(item(a, 1)), "invalid", null, 250, List.of()), 400);
        post(request(UUID.randomUUID(), List.of(item(a, 1)), "pix", null, 250, List.of(UUID.randomUUID())), 400);
        assertMissing(requestId); assertThat(balance(a)).isEqualTo(10);
    }
    @Test void numericOverflowMergedQuantitiesLineTotalsTotalAndStockRollBack() throws Exception {
        UUID a = product(10, RequestFingerprints.MAX_SAFE_CENTS), b = product(10, 1), low = product(Integer.MIN_VALUE);
        for (var r : List.of(request(UUID.randomUUID(), List.of(item(a, Integer.MAX_VALUE), item(a, 1)), "pix", null, 0, List.of()),
                request(UUID.randomUUID(), List.of(item(a, 2)), "pix", null, 0, List.of()),
                request(UUID.randomUUID(), List.of(item(a, 1), item(b, 1)), "pix", null, 0, List.of()),
                request(UUID.randomUUID(), List.of(item(low, 1)), "pix", null, 250, List.of(low)))) {
            assertThat(post(r, 422).get("error").get("code").asString()).isEqualTo("numeric_overflow"); assertMissing(r.requestId());
        }
        assertThat(balance(a)).isEqualTo(10); assertThat(balance(b)).isEqualTo(10); assertThat(balance(low)).isEqualTo(Integer.MIN_VALUE);
    }
    @Test void maximumSafeMoneyAndZeroPriceCashSalesAreAccepted() throws Exception {
        UUID high = product(1, RequestFingerprints.MAX_SAFE_CENTS), free = product(1, 0);
        var max = post(request(UUID.randomUUID(), List.of(item(high, 1)), "cash", RequestFingerprints.MAX_SAFE_CENTS,
                RequestFingerprints.MAX_SAFE_CENTS, List.of()), 201);
        assertThat(max.get("totalCents").asLong()).isEqualTo(RequestFingerprints.MAX_SAFE_CENTS);
        assertThat(max.get("changeCents").asLong()).isZero();
        var zero = post(request(UUID.randomUUID(), List.of(item(free, 1)), "cash", 0L, 0, List.of()), 201);
        assertThat(zero.get("totalCents").asLong()).isZero(); assertThat(balance(free)).isZero();
    }
    @Test void missingAndHiddenProductsRejectWithoutConsumingOtherStock() throws Exception {
        UUID good = product(10), hidden = product(10); productService.delete(hidden);
        for (UUID absent : List.of(hidden, UUID.randomUUID())) {
            var r = request(UUID.randomUUID(), List.of(item(good, 1), item(absent, 1)), "pix", null, 500, List.of());
            post(r, 404); assertMissing(r.requestId());
        }
        assertThat(balance(good)).isEqualTo(10);
    }
    @Test void itemInsertFailureRollsBackSaleAndAllManagedStockWritesBeforeWaitingAdjustment() throws Exception {
        UUID a = product(10), b = product(10), requestId = UUID.randomUUID();
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        jdbc.execute("alter table sale_items add constraint test_reject_sale_product check (product_id <> '" + b + "'::uuid) not valid");
        try (var pool = Executors.newFixedThreadPool(2)) {
            var failed = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                List.of(a, b).stream().sorted(Comparator.comparing(UUID::toString)).forEach(products::findByIdForUpdate);
                locked.countDown(); await(release);
                service.checkout(request(requestId, List.of(item(a, 1), item(b, 1)), "pix", null, 500, List.of()));
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            var adjustment = pool.submit(() -> stock.adjust(a, json.readValue(
                    "{\"requestId\":\"" + UUID.randomUUID() + "\",\"quantity\":3}", CreateAdjustmentRequest.class)));
            try { awaitBlocked("products"); assertThat(adjustment.isDone()).isFalse(); }
            finally { release.countDown(); }
            assertThatThrownBy(() -> failed.get(10, TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .cause().isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThat(adjustment.get(10, TimeUnit.SECONDS).created()).isTrue();
        } finally {
            release.countDown();
            jdbc.execute("alter table sale_items drop constraint test_reject_sale_product");
        }
        assertMissing(requestId); assertThat(balance(a)).isEqualTo(13); assertThat(balance(b)).isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from sale_items where product_id in (?,?)", Integer.class, a, b)).isZero();
    }
    @Test void competingLastItemCheckoutsCannotOversell() throws Exception {
        UUID id = product(1);
        CountDownLatch sold = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var a = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.checkout(request(UUID.randomUUID(), id, 1));
                sold.countDown(); await(release); return result;
            }));
            assertThat(sold.await(5, TimeUnit.SECONDS)).isTrue();
            var rejected = request(UUID.randomUUID(), id, 1);
            var b = pool.submit(() -> outcome(rejected));
            try { awaitBlocked("products"); assertThat(b.isDone()).isFalse(); }
            finally { release.countDown(); }
            assertThat(a.get(10, TimeUnit.SECONDS).created()).isTrue();
            assertThat(b.get(10, TimeUnit.SECONDS)).isEqualTo("insufficient_stock");
            assertMissing(rejected.requestId());
        } finally { release.countDown(); }
        assertThat(balance(id)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from sale_items where product_id=?", Integer.class, id)).isEqualTo(1);
    }
    @Test void adjustmentAndCheckoutShareLockAndDoNotLoseUpdates() throws Exception {
        for (boolean adjustmentFirst : List.of(false, true)) {
            UUID id = product(10);
            var checkout = request(UUID.randomUUID(), id, 2);
            var adjustment = json.readValue("{\"requestId\":\"" + UUID.randomUUID() + "\",\"quantity\":3}", CreateAdjustmentRequest.class);
            CountDownLatch changed = new CountDownLatch(1), release = new CountDownLatch(1);
            Runnable adjust = () -> stock.adjust(id, adjustment);
            Runnable sell = () -> service.checkout(checkout);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var a = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    (adjustmentFirst ? adjust : sell).run(); changed.countDown(); await(release);
                }));
                assertThat(changed.await(5, TimeUnit.SECONDS)).isTrue();
                var b = pool.submit(adjustmentFirst ? sell : adjust);
                try { awaitBlocked("products"); assertThat(b.isDone()).isFalse(); }
                finally { release.countDown(); }
                a.get(10, TimeUnit.SECONDS); b.get(10, TimeUnit.SECONDS);
            } finally { release.countDown(); }
            assertThat(balance(id)).isEqualTo(11);
            assertThat(stockTransactions.lookup(adjustment.requestId()).quantity()).isEqualTo(3);
            assertThat(sales.lookup(checkout.requestId()).items()).singleElement().extracting(SaleResponse.Item::quantity).isEqualTo(2);
        }
    }
    @Test void duplicateWaitingForProductReturnsWinnerEvenAfterDeletion() throws Exception {
        UUID id = product(1); var r = request(UUID.randomUUID(), id, 1);
        CountDownLatch inserted = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var original = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.checkout(r); productService.delete(id); inserted.countDown(); await(release); return result;
            }));
            assertThat(inserted.await(5, TimeUnit.SECONDS)).isTrue();
            mvc.perform(get("/api/v1/sales/by-request-id/" + r.requestId()))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("request_not_found"));
            var duplicate = pool.submit(() -> service.checkout(r));
            try { awaitBlocked("products"); assertThat(duplicate.isDone()).isFalse(); } finally { release.countDown(); }
            assertThat(duplicate.get(10, TimeUnit.SECONDS).sale()).isEqualTo(original.get(10, TimeUnit.SECONDS).sale());
            assertThat(sales.lookup(r.requestId())).isEqualTo(original.get(10, TimeUnit.SECONDS).sale());
        } finally { release.countDown(); }
        assertThat(balance(id)).isZero();
    }
    @Test void differentCartSameIdRaceRollsBackLoserAndReadsWinnerInFreshTransaction() throws Exception {
        UUID a = product(10), b = product(20), requestId = UUID.randomUUID();
        CountDownLatch inserted = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var winner = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = service.checkout(request(requestId, a, 2)); inserted.countDown(); await(release); return result;
            }));
            assertThat(inserted.await(5, TimeUnit.SECONDS)).isTrue();
            var loser = pool.submit(() -> outcome(request(requestId, b, 3)));
            try { awaitBlocked("sales"); assertThat(loser.isDone()).isFalse(); } finally { release.countDown(); }
            assertThat(winner.get(10, TimeUnit.SECONDS).created()).isTrue();
            assertThat(loser.get(10, TimeUnit.SECONDS)).isEqualTo("request_id_reused");
        } finally { release.countDown(); }
        assertThat(balance(a)).isEqualTo(8); assertThat(balance(b)).isEqualTo(20);
        assertThat(jdbc.queryForObject("select count(*) from sales where request_id=?", Integer.class, requestId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from sale_items where product_id=?", Integer.class, b)).isZero();
    }
    @Test void metadataAndDeletionWritersSerializeWithCheckoutAndValidateAfterWait() throws Exception {
        for (boolean deletion : List.of(false, true)) {
            UUID id = product(10); var r = request(UUID.randomUUID(), id, 1);
            CountDownLatch changed = new CountDownLatch(1), release = new CountDownLatch(1);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var writer = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    if (deletion) productService.delete(id);
                    else productService.update(id, json.readValue("{\"name\":\"Changed " + id + "\",\"sellingPriceCents\":999}", UpdateProductRequest.class));
                    changed.countDown(); await(release);
                }));
                assertThat(changed.await(5, TimeUnit.SECONDS)).isTrue();
                var checkout = pool.submit(() -> outcome(r));
                try { awaitBlocked("products"); } finally { release.countDown(); }
                writer.get(10, TimeUnit.SECONDS);
                assertThat(checkout.get(10, TimeUnit.SECONDS)).isEqualTo(deletion ? "product_missing" : "total_changed");
            } finally { release.countDown(); }
            assertThat(balance(id)).isEqualTo(10); assertMissing(r.requestId());
        }
    }
    @Test void metadataAndDeletionWaitForActualCheckoutWithoutOverwritingStockOrSnapshots() throws Exception {
        for (boolean deletion : List.of(false, true)) {
            UUID id = product(10); var checkout = request(UUID.randomUUID(), id, 2);
            String originalName = products.findById(id).orElseThrow().getName();
            CountDownLatch sold = new CountDownLatch(1), release = new CountDownLatch(1);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var sale = pool.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                    var result = service.checkout(checkout); sold.countDown(); await(release); return result;
                }));
                assertThat(sold.await(5, TimeUnit.SECONDS)).isTrue();
                var metadata = pool.submit(() -> {
                    if (deletion) productService.delete(id);
                    else productService.update(id, json.readValue("{\"name\":\"Changed " + id + "\",\"sellingPriceCents\":999}", UpdateProductRequest.class));
                });
                try { awaitBlocked("products"); assertThat(metadata.isDone()).isFalse(); }
                finally { release.countDown(); }
                assertThat(sale.get(10, TimeUnit.SECONDS).created()).isTrue(); metadata.get(10, TimeUnit.SECONDS);
            } finally { release.countDown(); }
            assertThat(balance(id)).isEqualTo(8);
            assertThat(sales.lookup(checkout.requestId()).items()).singleElement().satisfies(line -> {
                assertThat(line.productName()).isEqualTo(originalName);
                assertThat(line.unitPriceCents()).isEqualTo(250);
                assertThat(line.lineTotalCents()).isEqualTo(500);
            });
        }
    }
    @Test void reversedCartOrderLocksCanonicalFirstWithoutLockingLaterProduct() throws Exception {
        var ids = List.of(product(10), product(10)).stream().sorted(Comparator.comparing(UUID::toString)).toList();
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        var r = request(UUID.randomUUID(), List.of(item(ids.get(1), 1), item(ids.get(0), 1)), "pix", null, 500, List.of());
        try (var pool = Executors.newFixedThreadPool(2)) {
            var blocker = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                products.findByIdForUpdate(ids.getFirst()); locked.countDown(); await(release);
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            var checkout = pool.submit(() -> service.checkout(r));
            try {
                awaitBlocked("products");
                new TransactionTemplate(transactions).executeWithoutResult(status -> jdbc.queryForObject(
                        "select id from products where id=? for update nowait", UUID.class, ids.get(1)));
            } finally { release.countDown(); }
            blocker.get(10, TimeUnit.SECONDS); assertThat(checkout.get(10, TimeUnit.SECONDS).created()).isTrue();
        } finally { release.countDown(); }
    }
    @Test void lockTimeoutRollsBackCheckout() throws Exception {
        UUID id = product(10); var r = request(UUID.randomUUID(), id, 1);
        CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        try (var pool = Executors.newSingleThreadExecutor()) {
            var blocker = pool.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                products.findByIdForUpdate(id); locked.countDown(); await(release);
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            try { assertThat(post(r, 503).get("error").get("code").asString()).isEqualTo("inventory_busy"); }
            finally { release.countDown(); }
            blocker.get(10, TimeUnit.SECONDS);
        } finally { release.countDown(); }
        assertMissing(r.requestId()); assertThat(balance(id)).isEqualTo(10);
    }
    @Test void committedCheckoutLookupSurvivesAnotherApplicationStartup() {
        UUID id = product(10), requestId = UUID.randomUUID();
        var saved = service.checkout(request(requestId, id, 2)).sale();
        try (var restarted = new SpringApplicationBuilder(StockroomApplication.class).web(WebApplicationType.NONE).run(
                "--spring.datasource.url=" + System.getenv("TEST_DATABASE_URL"),
                "--spring.datasource.username=" + System.getenv().getOrDefault("TEST_DATABASE_USERNAME", "stockroom"),
                "--spring.datasource.password=" + System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "stockroom_dev"))) {
            assertThat(restarted.getBean(SaleTransactions.class).lookup(requestId)).isEqualTo(saved);
            assertThat(restarted.getBean(ProductRepository.class).findById(id).orElseThrow().getStock()).isEqualTo(8);
        }
    }
    private String outcome(CheckoutRequest r) {
        try { service.checkout(r); return "created"; } catch (ApiException error) { return error.code(); }
    }
    private void assertMissing(UUID id) {
        assertThat(jdbc.queryForObject("select count(*) from sales where request_id=?", Integer.class, id)).isZero();
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(12, TimeUnit.SECONDS)) throw new IllegalStateException("Latch timed out"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new RuntimeException(error); }
    }
    private void awaitBlocked(String table) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            int count = jdbc.queryForObject("select count(*) from pg_stat_activity where datname=current_database() and pid <> pg_backend_pid() and cardinality(pg_blocking_pids(pid)) > 0 and wait_event_type='Lock' and query like ?", Integer.class, "%" + table + "%");
            if (count > 0) return;
            Thread.sleep(20);
        }
        fail("No PostgreSQL lock wait for " + table);
    }
}
