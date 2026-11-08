package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class NetEaseCryptoTest {
    @Test fun mobileEncodingMatchesAnIndependentNodeCryptoVector() {
        val text="{\"userId\":7,\"limit\":100,\"offset\":0,\"includeTop\":\"true\",\"e_r\":false}"
        val result=NetEaseCrypto.encodeEapi("/api/user/playlist/create",text)
        assertEquals(setOf("params"),result.keys)
        assertEquals("B794DDEDF8B618087E534DC803FDE82C549FFC467F22BFC4FCC8AD4576F3E671CC70E44DFFD72401772D52A49A927BE6286267DB40BCA707402A617B950C09F9844DC8CCD5188664506C6DCEF714D485470AB0B8926E4EDC24679CBA26C40EAB625080D0C48BD877EC4EE85526523F505686CFC3FD63CCB448DA17FDE5287AC9C093F3432D113513680C896329606C7844FE942688530B191A230CB680CC6F92",result["params"])
        assertNotEquals(result,NetEaseCrypto.encodeEapi("/api/user/playlist/collect",text))
    }
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
