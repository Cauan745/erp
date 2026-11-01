package com.stockroom.erp.common;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class HealthControllerTest {
    @Test
    void returnsProcessLivenessWithoutDatabaseAccess() throws Exception {
        MockMvcBuilders.standaloneSetup(new HealthController()).build().perform(get("/healthz"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
    }
}
