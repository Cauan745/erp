package com.stockroom.erp;

import com.stockroom.erp.product.*;
import com.stockroom.erp.sale.*;
import com.stockroom.erp.stock.*;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class DatabaseFoundationIT {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        String url = System.getenv("TEST_DATABASE_URL");
        // Refuse absent URLs and non-test database names. Never clean a developer's database.
        if (url == null || !url.matches("jdbc:postgresql://[^/]+/[A-Za-z0-9_]+_test")) {
            throw new IllegalStateException("TEST_DATABASE_URL must explicitly name an isolated *_test database");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv().getOrDefault("TEST_DATABASE_USERNAME", "stockroom"));
        properties.add("spring.datasource.password", () -> System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "stockroom_dev"));
    }

    @Autowired ProductRepository products;
    @Autowired SaleRepository sales;
    @Autowired SaleItemRepository items;
    @Autowired StockAdjustmentRepository adjustments;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;
    @Autowired DataSource datasource;
    @Autowired PlatformTransactionManager transactions;

    private Product product(String name, String barcode, int stock) {
        return products.saveAndFlush(new Product(name, barcode, "General", null, 250, stock));
    }
    private String unique() { return UUID.randomUUID().toString(); }
    private String fingerprint() { return "a".repeat(64); }

    @Test @Transactional
    void flywayOwnsSchemaAndOpeningStockHasNoAdjustment() {
        assertThat(jdbc.queryForObject("select count(*) from flyway_schema_history where success", Integer.class)).isEqualTo(1);
        for (int stock : List.of(10, 0, -5)) {
            Product p = product(unique(), null, stock);
            assertThat(p.getId()).isNotNull();
            em.clear();
            assertThat(products.findById(p.getId()).orElseThrow().getStock()).isEqualTo(stock);
            assertThat(jdbc.queryForObject("select count(*) from stock_adjustments where product_id = ?", Integer.class, p.getId())).isZero();
        }
        assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname = 'public'", String.class))
                .containsExactlyInAnyOrder("flyway_schema_history", "products", "sales", "sale_items", "stock_adjustments");
    }

    @Test @Transactional
    void namesFoldOnlyAsciiAndNullableBarcodesCanRepeat() {
        String suffix = unique();
        Product p = product("Coffee" + suffix, null, 0);
        product("É" + suffix, null, 0);
        product("é" + suffix, null, 0);
        jdbc.update("update products set deleted_at = now() where id = ?", p.getId());
        assertThatThrownBy(() -> product("COFFEE" + suffix, null, 0))
                .hasStackTraceContaining("products_name_unique");
    }

    @Test @Transactional
    void barcodeReservationSurvivesSoftDeletion() {
        String barcode = unique();
        Product p = product(unique(), barcode, 0);
        jdbc.update("update products set deleted_at = now() where id = ?", p.getId());
        assertThatThrownBy(() -> product(unique(), barcode, 0)).hasStackTraceContaining("products_barcode_unique");
    }

    @Test @Transactional
    void allEntitiesRoundTripAndReasonUpdatePreservesIdentityAndStock() {
        Product p = product(unique(), null, 10);
        UUID saleRequest = UUID.randomUUID();
        Sale sale = sales.saveAndFlush(new Sale(500, PaymentMethod.CASH, 1000L, saleRequest, fingerprint()));
        SaleItem line = items.saveAndFlush(new SaleItem(sale, p, 0, p.getName(), 2, 250, 500));
        UUID adjustmentRequest = UUID.randomUUID();
        StockAdjustment adjustment = adjustments.saveAndFlush(new StockAdjustment(p, -2, "sale-shortage-replenishment", adjustmentRequest, fingerprint()));
        var created = jdbc.queryForObject("select created_at from stock_adjustments where id = ?", java.time.OffsetDateTime.class, adjustment.getId()).toInstant();
        em.clear();
        assertThat(sales.findByRequestId(saleRequest).orElseThrow().getPaymentMethod()).isEqualTo(PaymentMethod.CASH);
        assertThat(items.findBySaleIdInOrderBySaleIdAscLineNumberAsc(List.of(sale.getId())))
                .extracting(SaleItem::getId).containsExactly(line.getId());
        assertThat(adjustments.updateReason(adjustment.getId(), "counted")).isEqualTo(1);
        StockAdjustment saved = adjustments.findByRequestId(adjustmentRequest).orElseThrow();
        assertThat(saved.getQuantity()).isEqualTo(-2);
        // PostgreSQL timestamps round to microseconds.
        assertThat(saved.getCreatedAt()).isEqualTo(created);
        assertThat(saved.getReason()).isEqualTo("counted");
        assertThat(saved.getRequestFingerprint()).isEqualTo(fingerprint());
        assertThat(products.findById(p.getId()).orElseThrow().getStock()).isEqualTo(10);
    }

    @Test @Transactional
    void uniqueRequestIdsAreScopedByOperationType() {
        Product p = product(unique(), null, 0);
        UUID request = UUID.randomUUID();
        sales.saveAndFlush(new Sale(0, PaymentMethod.PIX, null, request, fingerprint()));
        adjustments.saveAndFlush(new StockAdjustment(p, 1, null, request, fingerprint()));
        assertThatThrownBy(() -> sales.saveAndFlush(new Sale(0, PaymentMethod.PIX, null, request, fingerprint())))
                .hasStackTraceContaining("sales_request_id_unique");
    }

    @Test @Transactional
    void rejectsDuplicateAdjustmentRequestIds() {
        Product p = product(unique(), null, 0);
        UUID request = UUID.randomUUID();
        adjustments.saveAndFlush(new StockAdjustment(p, 1, null, request, fingerprint()));
        assertThatThrownBy(() -> adjustments.saveAndFlush(new StockAdjustment(p, 1, null, request, fingerprint())))
                .hasStackTraceContaining("stock_adjustments_request_id_unique");
    }

    @Test
    void schemaChecksRejectInvalidMoneyPaymentAndQuantities() {
        // Each failure owns a separate transaction because PostgreSQL aborts on a constraint error.
        for (String invalid : List.of(
                "insert into stock_adjustments(id,product_id,quantity,created_at,request_id,request_fingerprint) values(gen_random_uuid(),gen_random_uuid(),1,now(),gen_random_uuid(),repeat('a',64))",
                "insert into products(id,name,category,selling_price_cents,stock,created_at,updated_at) values(gen_random_uuid(),'bad','General',-1,0,now(),now())",
                "insert into products(id,name,category,selling_price_cents,stock,created_at,updated_at) values(gen_random_uuid(),'bad','General',9007199254740992,0,now(),now())",
                "insert into sales(id,total_cents,payment_method,created_at,request_id,request_fingerprint) values(gen_random_uuid(),10,'cash',now(),gen_random_uuid(),repeat('a',64))",
                "insert into sales(id,total_cents,payment_method,cash_received_cents,created_at,request_id,request_fingerprint) values(gen_random_uuid(),10,'pix',20,now(),gen_random_uuid(),repeat('a',64))",
                "insert into sales(id,total_cents,payment_method,created_at,request_id,request_fingerprint) values(gen_random_uuid(),10,'other',now(),gen_random_uuid(),repeat('a',64))")) {
            assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> jdbc.execute(invalid)))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        }
    }

    @Test @Transactional
    void foreignKeysAndQuantityChecksProtectHistoricalRows() {
        Product p = product(unique(), null, 0);
        Sale sale = sales.saveAndFlush(new Sale(0, PaymentMethod.PIX, null, UUID.randomUUID(), fingerprint()));
        assertThatThrownBy(() -> items.saveAndFlush(new SaleItem(sale, p, 0, p.getName(), 0, 0, 0)))
                .hasStackTraceContaining("sale_items_quantity_check");
    }

    @Test
    void incompatibleMappingFailsValidationWithoutChangingSchema() {
        var factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(datasource);
        factory.setPackagesToScan("com.stockroom.schemafixture");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "validate"));
        assertThatThrownBy(factory::afterPropertiesSet)
                .hasRootCauseInstanceOf(org.hibernate.tool.schema.spi.SchemaManagementException.class)
                .hasStackTraceContaining("wrong column type encountered in column [stock]");
        assertThat(jdbc.queryForObject("select data_type from information_schema.columns where table_name='products' and column_name='stock'", String.class))
                .isEqualTo("integer");
    }

    @Test
    void committedDataSurvivesAnotherApplicationStartup() {
        TransactionTemplate tx = new TransactionTemplate(transactions);
        UUID id = tx.execute(status -> product(unique(), null, 17).getId());
        try (var restarted = new SpringApplicationBuilder(StockroomApplication.class)
                .web(WebApplicationType.NONE).run(
                        "--spring.datasource.url=" + System.getenv("TEST_DATABASE_URL"),
                        "--spring.datasource.username=" + System.getenv().getOrDefault("TEST_DATABASE_USERNAME", "stockroom"),
                        "--spring.datasource.password=" + System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "stockroom_dev"))) {
            assertThat(restarted.getBean(ProductRepository.class).findById(id).orElseThrow().getStock()).isEqualTo(17);
        } finally {
            tx.executeWithoutResult(status -> products.deleteById(id));
        }
    }
}
