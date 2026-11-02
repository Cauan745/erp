package com.stockroom.erp.stock;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StockHistoryQuery {
    private final JdbcTemplate jdbc;
    public StockHistoryQuery(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // A read projection across two independent business tables, on the JPA datasource/transaction.
    public List<HistoryEntryResponse> list(int limit) {
        return jdbc.query("""
                select * from (
                    select a.id, a.product_id, p.name as product_name, a.quantity, a.reason,
                           'adjustment' as source, a.created_at
                    from stock_adjustments a join products p on p.id = a.product_id
                    union all
                    select i.id, i.product_id, i.product_name, -i.quantity, 'Sale', 'sale', s.created_at
                    from sale_items i join sales s on s.id = i.sale_id
                ) history order by created_at desc, source collate "C", id limit ?
                """, (rs, row) -> new HistoryEntryResponse(rs.getObject("id", UUID.class),
                rs.getObject("product_id", UUID.class), rs.getString("product_name"), rs.getInt("quantity"),
                rs.getString("reason"), rs.getString("source"), rs.getTimestamp("created_at").toInstant()), limit);
    }
}
