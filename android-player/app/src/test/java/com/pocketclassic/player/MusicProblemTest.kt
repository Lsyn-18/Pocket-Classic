package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test
import java.io.FileNotFoundException
import java.io.IOException
import java.net.SocketTimeoutException

class MusicProblemTest {
    @Test fun nestedPlaybackErrorsKeepTheirRecoveryReasonAndHideProviderAddresses() {
        val restricted=IOException("wrapper",MusicProblem("unavailable","版权限制"))
        assertEquals("unavailable",problemReason(restricted));assertEquals("版权限制",problemMessage(restricted))
        assertEquals("network",problemReason(IOException("wrapper",SocketTimeoutException())))
        assertEquals("local-access",problemReason(FileNotFoundException("content://provider/private")))
        assertFalse(problemMessage(FileNotFoundException("content://provider/private")).contains("content://"))
        assertFalse(problemMessage(IOException("open /data/user/0/private/song failed")).contains("/data/"))
    }
}
