package com.stockroom.schemafixture;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "products")
public class BadProduct {
    @Id private UUID id;
    @Column(name = "stock") private String stock;
}
