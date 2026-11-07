package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.FilterInputStream
import java.io.IOException

class OfflineMusicTest {
    private fun asset(name: String) = javaClass.classLoader!!.getResourceAsStream(name)!!.use { it.readBytes() }
    @Test fun standardNcmDecodesWithCoverPaddingAndShortReads() {
        val bytes = asset("offline-silence.ncm")
        val input = object : FilterInputStream(ByteArrayInputStream(bytes)) {
            override fun read(b: ByteArray, off: Int, len: Int) = super.read(b, off, minOf(len, 17))
            override fun skip(n: Long) = super.skip(minOf(n, 2))
        }
        val output = ByteArrayOutputStream(); NcmDecoder.decode(input, output)
        assertArrayEquals(asset("offline-silence.wav"), output.toByteArray())
        val header = NcmDecoder.header(ByteArrayInputStream(bytes)); assertTrue(header.metadata.contains("Pocket Classic"))
    }
    @Test fun corruptAndOversizedContainersFailBeforeAllocation() {
        val valid = asset("offline-silence.ncm")
        assertThrows(IOException::class.java) { NcmDecoder.header(ByteArrayInputStream(ByteArray(20))) }
        val huge = valid.copyOf(); for (i in 10..13) huge[i] = 0x7f
        assertThrows(IOException::class.java) { NcmDecoder.header(ByteArrayInputStream(huge)) }
        assertThrows(IOException::class.java) { NcmDecoder.decode(ByteArrayInputStream(valid.copyOf(35)), ByteArrayOutputStream()) }
    }
    @Test fun localIdsAreStableNegativeAndSafeForTheJavascriptBridge() {
        val a = LocalMusicLibrary.idFor("content://media/external/audio/media/7")
        assertTrue(a < 0 && a > -9_007_199_254_740_991L)
        assertEquals(a, LocalMusicLibrary.idFor("content://media/external/audio/media/7"))
        assertNotEquals(a, LocalMusicLibrary.idFor("content://media/external/audio/media/8"))
        assertTrue(NativeContract.validMode("local")); assertTrue(NativeContract.validMode("liked")); assertTrue(NativeContract.allowedApi("local"))
        assertFalse(NativeContract.allowedApi("local?uri=file:///etc/passwd")); assertFalse(NativeContract.allowedApi("liked?offset=0&cookie=x"))
    }
    @Test fun likedPlaylistsUseTypeAndOwnershipInsteadOfNames() {
        assertTrue(isOwnLikedPlaylist(5, 7, 7)); assertTrue(isOwnLikedPlaylist(5, 0, 7))
        assertFalse(isOwnLikedPlaylist(5, 8, 7)); assertFalse(isOwnLikedPlaylist(0, 7, 7))
    }
}
