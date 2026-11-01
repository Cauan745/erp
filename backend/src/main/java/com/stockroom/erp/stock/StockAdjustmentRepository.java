package com.stockroom.erp.stock;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, UUID> {
    Optional<StockAdjustment> findByRequestId(UUID requestId);

    // Call inside a service transaction. The JPQL update changes no inventory/identity fields.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update StockAdjustment a set a.reason = :reason where a.id = :id")
    int updateReason(@Param("id") UUID id, @Param("reason") String reason);
}
