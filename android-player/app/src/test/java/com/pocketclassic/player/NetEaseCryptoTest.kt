package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class NetEaseCryptoTest {
    @Test fun encodingMatchesTheIndependentNodeCryptoVector() {
        val result=NetEaseCrypto.encode("{\"hello\":\"网易云\"}","abcdefghijklmnop")
        assertEquals("7RIul0zabE3qf4Q8rgkaWD4Bh9MuuJdvD4WETbExdtdKEQtH+obZCyzXayPHSnrE",result["params"])
        assertEquals("d15a1683c992095d0c234c19966605c5c5964911268bbeda8cb8d08d834913e59d53b32358903a121b5fca784c1f5ae44951fd02524df58ecc98e52cc7cf8689b42c2e93ddf05b0592512d87f5960467e2f086c018849d76014d323500e30f13ef4cafbb0cf5a66731a3f1776c75ca35d0062dac70a3e33245afabcf47938487",result["encSecKey"])
    }
    @Test fun everyRequestUsesFreshCryptographicRandomness() {
        val first=NetEaseCrypto.encode("{}")
        val second=NetEaseCrypto.encode("{}")
        assertNotEquals(first,second);assertEquals(256,first.getValue("encSecKey").length)
    }
    @Test fun invalidSecretsAreRejected() {
        for(secret in listOf("", "short","中".repeat(16),"!".repeat(16)))assertThrows(IllegalArgumentException::class.java) { NetEaseCrypto.encode("{}",secret) }
    }
}
