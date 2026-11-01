package com.stockroom.erp.sale;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SaleRepository extends JpaRepository<Sale, UUID> {
    Optional<Sale> findByRequestId(UUID requestId);
    List<Sale> findAllByOrderByCreatedAtDescIdAsc();
}
