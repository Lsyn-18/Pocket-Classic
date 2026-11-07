package com.pocketclassic.player

import android.content.ContentValues
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.MediaStore
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
@androidx.annotation.OptIn(UnstableApi::class)
class OfflineMusicDeviceTest {
    @Test fun removeUiTestCopies() {
        val raw = InstrumentationRegistry.getArguments().getString("cleanupTestIds")
        assumeTrue("Only explicitly named synthetic UI fixtures are removed", raw != null)
        val ids = raw!!.split(',').map(String::toLong).toSet(); val library = LocalMusicLibrary(InstrumentationRegistry.getInstrumentation().targetContext)
        val tracks = library.catalog().getJSONArray("tracks")
        for (i in 0 until tracks.length()) { val track = tracks.getJSONObject(i); if (track.getLong("id") in ids) assertTrue(track.getString("name").startsWith("PocketClassic-Offline-Test-") || track.getString("name") == "Pocket Classic 离线测试") }
        library.removeImported(ids)
    }
    @Test fun independentOfflineCopiesDecodeAndPlayWithNetworkRejected() {
        assumeTrue(Build.VERSION.SDK_INT >= 29)
        val instrumentation = InstrumentationRegistry.getInstrumentation(); val target = instrumentation.targetContext
        val key = "offline-test-" + UUID.randomUUID(); val base = File(target.cacheDir, key).apply { mkdirs() }
        val context = object : ContextWrapper(target) {
            override fun getFilesDir() = File(base, "files").apply { mkdirs() }
            override fun getCacheDir() = File(base, "cache").apply { mkdirs() }
            override fun getSharedPreferences(name: String, mode: Int): SharedPreferences = target.getSharedPreferences("$key-$name", mode)
        }
        val resolver = target.contentResolver; val uris = mutableListOf<Uri>(); val player = AtomicReference<ExoPlayer>()
        val networkCalls = AtomicInteger(); val cloudCalls = AtomicInteger()
        try {
            for ((name, mime) in listOf("offline-silence.wav" to "audio/wav", "offline-silence.ncm" to "application/octet-stream")) {
                val values = ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME, "$key-$name"); put(MediaStore.MediaColumns.MIME_TYPE, mime); put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/PocketClassic-tests") }
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)!!; uris.add(uri)
                resolver.openOutputStream(uri)!!.use { output -> instrumentation.context.assets.open(name).use { it.copyTo(output) } }
            }
            val library = LocalMusicLibrary(context)
            library.importFiles(listOf(uris[0]), "device"); library.importFiles(listOf(uris[1]), "netease")
            val catalog = library.catalog().getJSONArray("tracks"); assertEquals(2, catalog.length())
            assertFalse(catalog.toString().contains("file:")); assertFalse(catalog.toString().contains("content:"))
            assertEquals(setOf("device", "netease"), (0 until catalog.length()).map { catalog.getJSONObject(it).getString("category") }.toSet())
            // Delete only this test's source documents. The app's offline copies must remain playable.
            uris.forEach { resolver.delete(it, null, null) }; uris.clear()
            val restored = LocalMusicLibrary(context); assertEquals(2, restored.catalog().getJSONArray("tracks").length())
            val items = (0 until catalog.length()).map { mediaItem(restored.track(catalog.getJSONObject(it).getLong("id")), "local", key) }
            val rejectNetwork = DataSource.Factory { object : BaseDataSource(true) {
                override fun open(dataSpec: DataSpec): Long { networkCalls.incrementAndGet(); throw IOException("Network disabled by offline regression") }
                override fun read(buffer: ByteArray, offset: Int, length: Int) = C.RESULT_END_OF_INPUT
                override fun getUri(): Uri? = null
                override fun close() { }
            } }
            val factory = musicDataSources(context, restored, { cloudCalls.incrementAndGet(); error("Cloud lookup forbidden") }, rejectNetwork)
            instrumentation.runOnMainSync { player.set(ExoPlayer.Builder(target).setMediaSourceFactory(DefaultMediaSourceFactory(factory)).build().apply { volume = 0f; setMediaItems(items); prepare(); play() }) }
            fun ready(index: Int) {
                val end = SystemClock.elapsedRealtime() + 15000
                while (SystemClock.elapsedRealtime() < end) {
                    val done = AtomicReference(false)
                    instrumentation.runOnMainSync { assertNull(player.get().playerError); done.set(player.get().currentMediaItemIndex == index && player.get().playbackState == Player.STATE_READY && player.get().currentPosition > 200) }
                    if (done.get()) return
                    Thread.sleep(100)
                }
                fail("Offline item $index did not play")
            }
            ready(0); instrumentation.runOnMainSync { assertEquals(12000L, player.get().duration); player.get().seekToNextMediaItem() }; ready(1)
            assertEquals(0, networkCalls.get()); assertEquals(0, cloudCalls.get())
            instrumentation.sendStatus(2, android.os.Bundle().apply { putString("stream", "\n[Offline] Device file and NCM played from persistent copies; source files deleted; HTTP and cloud calls: 0\n") })
        } finally {
            instrumentation.runOnMainSync { player.get()?.release() }
            uris.forEach { resolver.delete(it, null, null) }
            context.getSharedPreferences("local-music", Context.MODE_PRIVATE).edit().clear().commit()
            check(base.parentFile == target.cacheDir); base.deleteRecursively()
        }
    }
}
