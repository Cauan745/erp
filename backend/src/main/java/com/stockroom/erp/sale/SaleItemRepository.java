package com.stockroom.erp.sale;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SaleItemRepository extends JpaRepository<SaleItem, UUID> {
    List<SaleItem> findBySaleIdInOrderBySaleIdAscLineNumberAsc(Collection<UUID> saleIds);
}
