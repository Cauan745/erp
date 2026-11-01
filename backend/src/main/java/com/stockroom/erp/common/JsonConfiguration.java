package com.stockroom.erp.common;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.type.LogicalType;

@Configuration
public class JsonConfiguration {
    @Bean
    JsonMapperBuilderCustomizer strictJson() {
        return builder -> builder
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .withCoercionConfig(LogicalType.Integer, config -> {
                    config.setCoercion(CoercionInputShape.String, CoercionAction.Fail);
                    config.setCoercion(CoercionInputShape.EmptyString, CoercionAction.Fail);
                    config.setCoercion(CoercionInputShape.Float, CoercionAction.Fail);
                    config.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
                })
                .withCoercionConfig(LogicalType.Textual, config -> {
                    config.setCoercion(CoercionInputShape.Integer, CoercionAction.Fail);
                    config.setCoercion(CoercionInputShape.Float, CoercionAction.Fail);
                    config.setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail);
                });
    }
}
