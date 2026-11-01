package com.stockroom.erp.product;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import jakarta.validation.constraints.*;

// Field binding distinguishes omitted optional values from explicit JSON null.
public class CreateProductRequest {
    @JsonProperty @NotBlank
    private String name;
    @JsonProperty @JsonSetter(nulls = Nulls.FAIL)
    private String barcode;
    @JsonProperty @JsonSetter(nulls = Nulls.FAIL)
    private String category;
    @JsonProperty @Min(0) @Max(9007199254740991L)
    private Long costCents;
    @JsonProperty @NotNull @Min(0) @Max(9007199254740991L)
    private Long sellingPriceCents;
    @JsonProperty @JsonSetter(nulls = Nulls.FAIL)
    private Integer stock = 0;
    public Integer stock() { return stock; }

    public String name() { return name; }
    public String barcode() { return barcode; }
    public String category() { return category; }
    public Long costCents() { return costCents; }
    public Long sellingPriceCents() { return sellingPriceCents; }
}
