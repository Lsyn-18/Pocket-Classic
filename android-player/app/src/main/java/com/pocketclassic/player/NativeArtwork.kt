package com.pocketclassic.player

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class NativeArtwork(private val download: (String) -> ByteArray = ::downloadArtwork) {
    private val cache = LruCache<String, String>(8)
    private val lock = Mutex()
    suspend fun load(raw: String): String = withContext(Dispatchers.IO) { lock.withLock {
        val source = ArtworkPolicy.url(raw) ?: throw IOException("无效专辑封面")
        cache.get(source)?.let { return@withLock it }
        val bytes = download(source)
        if (bytes.size > 2_000_000) throw IOException("封面过大")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth !in 1..4096 || bounds.outHeight !in 1..4096) throw IOException("无效专辑封面")
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 640) sample *= 2
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: throw IOException("封面无法读取")
        val scale = minOf(1f, 320f / maxOf(bitmap.width, bitmap.height))
        val thumb = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
        val output = ByteArrayOutputStream()
        try { thumb.compress(Bitmap.CompressFormat.JPEG, 88, output) }
        finally { if (thumb !== bitmap) thumb.recycle(); bitmap.recycle() }
        val data = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
        cache.put(source, data); data
    }}
}

private fun downloadArtwork(source: String): ByteArray {
    val connection = URL(source).openConnection() as HttpURLConnection
    return try {
        connection.instanceFollowRedirects = false
        connection.connectTimeout = 8000; connection.readTimeout = 8000
        connection.setRequestProperty("Accept", "image/*")
        if (connection.responseCode != 200) throw IOException("封面暂不可用")
        if (connection.contentLength > 2_000_000) throw IOException("封面过大")
        connection.inputStream.use { input ->
            val output = ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while (true) { val count = input.read(buffer); if (count < 0) break
                if (output.size() + count > 2_000_000) throw IOException("封面过大")
                output.write(buffer, 0, count)
            }; output.toByteArray()
        }
    } finally { connection.disconnect() }
}
