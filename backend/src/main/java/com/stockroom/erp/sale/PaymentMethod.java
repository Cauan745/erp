package com.stockroom.erp.sale;

import java.util.Arrays;

public enum PaymentMethod {
    CASH("cash"), DEBIT_CARD("debit_card"), CREDIT_CARD("credit_card"), PIX("pix");

    private final String value;
    PaymentMethod(String value) { this.value = value; }
    public String value() { return value; }

    public static PaymentMethod fromValue(String value) {
        return Arrays.stream(values()).filter(method -> method.value.equals(value)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("invalid_payment_method"));
    }
}
