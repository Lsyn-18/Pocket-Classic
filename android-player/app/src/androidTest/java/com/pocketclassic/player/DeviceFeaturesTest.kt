package com.pocketclassic.player

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.IOException

@RunWith(AndroidJUnit4::class)
class DeviceFeaturesTest {
    @Test fun coverThumbnailDecodesAndCachesWithoutLogin() = runBlocking {
        val image = Bitmap.createBitmap(700, 460, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(32, 96, 160)) }
        val bytes = ByteArrayOutputStream().also { image.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray(); image.recycle()
        var downloads = 0
        val artwork = NativeArtwork { downloads++; bytes }
        val first = artwork.load("http://p1.music.126.net/test/cover.jpg")
        val again = artwork.load("https://p1.music.126.net/test/cover.jpg?param=100y100")
        assertEquals(first, again); assertEquals(1, downloads)
        val thumb = Base64.decode(first.substringAfter(','), Base64.DEFAULT).let { BitmapFactory.decodeByteArray(it, 0, it.size) }
        assertNotNull(thumb); assertTrue(thumb.width <= 320); assertTrue(thumb.height <= 320); thumb.recycle()
        try { artwork.load("http://127.0.0.1/secret"); fail("Unexpected cover host accepted") } catch (_: IOException) { }
        assertEquals(1, downloads)
    }
    @Test fun albumAndCoverSurviveTheNativePlaybackQueue() {
        val track = MusicTrack(123, "Song", "Artist", 120000, cover = "http://p2.music.126.net/test/123.jpg", album = "Album")
        val result = trackFromJson(trackJson(mediaItem(track, "daily", "fixture")))
        assertEquals("https://p2.music.126.net/test/123.jpg?param=320y320", result.cover)
        assertEquals("Album", result.album); assertEquals(track.id, result.id)
    }
}
