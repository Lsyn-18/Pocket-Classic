package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin

class NativeContractTest {
    @Test fun musicRoutesAreWhitelisted() {
        for (route in listOf("status", "playlists", "daily", "roam", "tracks?id=123456789", "artists?offset=0", "artist-tracks?id=123&offset=100")) assertTrue(NativeContract.allowedApi(route))
        for (route in listOf("resolve", "logout", "qr", "https://evil.example", "tracks?id=0", "tracks?id=1&cookie=x", "tracks?id=../1", "tracks?id=1/2")) assertFalse(NativeContract.allowedApi(route))
        for (route in listOf("artists?offset=-1", "artists?offset=100000", "artists?offset=00", "artist-tracks?id=0&offset=0", "artist-tracks?id=1&offset=0&cookie=x")) assertFalse(NativeContract.allowedApi(route))
        assertTrue(NativeContract.validMode("artist"))
    }
    @Test fun musicQualityRestoresOnlySupportedLevels() {
        for (quality in listOf("standard","exhigh","lossless","hires")) { assertTrue(MusicQuality.valid(quality));assertEquals(quality,MusicQuality.restored(quality)) }
        assertFalse(MusicQuality.valid("all"));assertEquals("standard",MusicQuality.restored(null));assertEquals("standard",MusicQuality.restored("unknown"))
    }
    @Test fun onlyThePackagedPageIsTrusted() {
        assertTrue(NativeContract.trustedAsset("https", "appassets.androidplatform.net", "/assets/player.html"))
        assertFalse(NativeContract.trustedAsset("http", "appassets.androidplatform.net", "/assets/player.html"))
        assertFalse(NativeContract.trustedAsset("https", "evil.example", "/assets/player.html"))
        assertFalse(NativeContract.trustedAsset("https", "appassets.androidplatform.net", "/assets/other.html"))
        assertFalse("resolve" in NativeContract.methods)
    }
    @Test fun rotationMatrixMatchesDeviceOrientationOnBothSidesOfUpright() {
        for (beta in listOf(-170.0, -120.0, -70.0, 0.0, 45.0, 85.0, 120.0, 170.0)) {
            for (gamma in listOf(-70.0, -20.0, 0.0, 35.0, 70.0)) {
                val b = Math.toRadians(beta); val g = Math.toRadians(gamma)
                val matrix = FloatArray(9).apply { this[6] = (-cos(b)*sin(g)).toFloat(); this[7] = sin(b).toFloat(); this[8] = (cos(b)*cos(g)).toFloat() }
                val actual = motionAngles(matrix)
                assertEquals(beta, actual.beta, .001); assertEquals(gamma, actual.gamma, .001)
            }
        }
    }
    @Test fun invalidRotationMatrixSizeIsRejected() {
        assertThrows(IllegalArgumentException::class.java) { motionAngles(FloatArray(4)) }
    }
    @Test fun radioRefillsCoalesceAndRejectRecentDuplicates() {
        val radio = RadioContinuation(); radio.switchSession("session-A")
        val ticket = radio.begin(listOf(1,2,3))!!
        assertNull(radio.begin(listOf(1,2,3)))
        val fresh = radio.accept(ticket, listOf(track(2),track(4),track(4),track(5)))
        assertEquals(listOf(4L,5L), fresh.map { it.id })
        radio.finish(ticket); assertNotNull(radio.begin(listOf(1,2,3,4,5)))
    }
    @Test fun radioResponsesCannotCrossPlaybackSessions() {
        val radio = RadioContinuation(); radio.switchSession("old")
        val old = radio.begin(listOf(1))!!; radio.switchSession("new")
        val current = radio.begin(listOf(9))!!
        assertTrue(radio.accept(old, listOf(track(2))).isEmpty())
        radio.finish(old); assertNull(radio.begin(listOf(9)))
        assertEquals(listOf(2L), radio.accept(current,listOf(track(2))).map { it.id })
    }
    @Test fun radioHistoryIsBoundedAndErrorsCanBeRetried() {
        val radio = RadioContinuation(); radio.switchSession("session")
        val ticket = radio.begin((1L..300L).toList())!!
        assertEquals(listOf(1L),radio.accept(ticket,listOf(track(1),track(300))).map { it.id })
        radio.finish(ticket); assertNotNull(radio.begin(emptyList()))
    }
    private fun track(id: Long) = MusicTrack(id,"Track","Artist",120000)
}
