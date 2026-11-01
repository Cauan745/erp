package com.stockroom.erp.sale;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class PaymentMethodConverter implements AttributeConverter<PaymentMethod, String> {
    @Override
    public String convertToDatabaseColumn(PaymentMethod value) {
        return value == null ? null : value.value();
    }

    @Override
    public PaymentMethod convertToEntityAttribute(String value) {
        return value == null ? null : PaymentMethod.fromValue(value);
    }
}
