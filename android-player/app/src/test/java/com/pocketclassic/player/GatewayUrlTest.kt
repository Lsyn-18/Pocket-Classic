package com.pocketclassic.player

import java.io.IOException
import org.junit.Assert.*
import org.junit.Test

class GatewayUrlTest {
    @Test fun privateNetworkAndEmulatorMayUseHttp() {
        assertEquals("http://192.168.1.20:17864", GatewayApi.normalizedUrl("http://192.168.1.20:17864/"))
        assertEquals("http://10.0.2.2:17864", GatewayApi.normalizedUrl("http://10.0.2.2:17864"))
        assertEquals("http://localhost:17864", GatewayApi.normalizedUrl("http://localhost:17864"))
    }
    @Test fun publicServiceRequiresHttps() { assertEquals("https://music.example.com", GatewayApi.normalizedUrl("https://music.example.com")); reject("http://music.example.com") }
    @Test fun hostnamePrefixesCannotImpersonatePrivateAddresses() { reject("http://10.attacker.example"); reject("http://192.168.attacker.example"); reject("http://172.16.attacker.example"); reject("http://010.0.0.1") }
    @Test fun embeddedCredentialsAndExtraRoutesAreRejected() { reject("https://user:secret@example.com"); reject("http://192.168.1.2/private"); reject("http://192.168.1.2?cookie=x"); reject("http://192.168.1.2:99999") }
    private fun reject(value: String) { try { GatewayApi.normalizedUrl(value); fail("Expected rejection: $value") } catch (_: IOException) {} }
}
