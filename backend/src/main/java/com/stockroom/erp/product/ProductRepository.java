package com.stockroom.erp.product;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    List<Product> findByDeletedAtIsNullOrderByCreatedAtDesc();
    Optional<Product> findByBarcodeAndDeletedAtIsNull(String barcode);

    // All product writers must call this before reading mutable state, inside a transaction.
    // Deliberately includes hidden rows so a duplicate request can be resolved first.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Product p where p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") UUID id);
}
