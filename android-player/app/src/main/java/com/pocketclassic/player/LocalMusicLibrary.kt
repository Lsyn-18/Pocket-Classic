package com.pocketclassic.player

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.Locale

/** Only native catalog entries can resolve to media. JavaScript never receives file paths. */
class LocalMusicLibrary(private val context: Context) {
    companion object {
        const val LIMIT = 5000
        private val lock = Any()
        private val formats = setOf("mp3", "flac", "m4a", "mp4", "aac", "wav", "ogg", "opus", "amr", "ncm")
        val permission: String get() = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
        fun idFor(value: String): Long { val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()); var id = 0L; for (i in 0..5) id = (id shl 8) or (bytes[i].toLong() and 255); return -id - 1 }
    }
    private val prefs = context.getSharedPreferences("local-music", Context.MODE_PRIVATE)
    private val resolver = context.contentResolver
    private val directory = File(context.filesDir, "local-music").apply { mkdirs() }
    private val decoded = File(context.cacheDir, "local-music-decoded").apply { mkdirs() }
    fun hasPermission() = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    private fun saved(): List<JSONObject> = synchronized(lock) {
        val array = runCatching { JSONArray(prefs.getString("catalog", "[]")) }.getOrDefault(JSONArray())
        (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    }
    private fun save(entries: List<JSONObject>) = synchronized(lock) { prefs.edit().putString("catalog", JSONArray(entries.take(LIMIT)).toString()).commit(); Unit }
    private fun publicTrack(entry: JSONObject): JSONObject = JSONObject().put("id", entry.getLong("id")).put("name", entry.optString("name"))
        .put("artist", entry.optString("artist", "未知歌手")).put("album", entry.optString("album")).put("durationMs", entry.optLong("durationMs"))
        .put("cover", "").put("local", true).put("origin", entry.optString("origin")).put("format", entry.optString("format"))
        .put("category", entry.optString("category", if(entry.optString("origin") == "网易云下载") "netease" else "device"))
    fun catalog(message: String = ""): JSONObject {
        val entries = saved().filter { it.optBoolean("imported") || hasPermission() }
        return JSONObject().put("tracks", JSONArray(entries.map(::publicTrack))).put("permissionGranted", hasPermission()).put("message", message)
    }
    fun scan(): JSONObject {
        if (!hasPermission()) return catalog("未授予音乐读取权限，可使用文件或文件夹导入")
        val entries = saved().filter { it.optBoolean("imported") }.toMutableList()
        val columns = mutableListOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.DISPLAY_NAME)
        if (Build.VERSION.SDK_INT >= 29) { columns.add(MediaStore.Audio.Media.RELATIVE_PATH); columns.add(MediaStore.MediaColumns.OWNER_PACKAGE_NAME) }
        resolver.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, columns.toTypedArray(),
            if (Build.VERSION.SDK_INT >= 29) "is_pending=0" else null, null, MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC")?.use { c ->
            while (c.moveToNext() && entries.size < LIMIT) {
                val row = c.getLong(0); val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, row)
                val fileName = c.getString(5).orEmpty(); val path = if (Build.VERSION.SDK_INT >= 29) c.getString(6).orEmpty() + " " + c.getString(7).orEmpty() else ""
                val format = fileName.substringAfterLast('.', "").lowercase(Locale.ROOT)
                if (format !in formats || format == "ncm") continue
                entries.add(JSONObject().put("id", idFor(uri.toString())).put("uri", uri.toString()).put("imported", false)
                    .put("name", c.getString(1).orEmpty().ifBlank { fileName.substringBeforeLast('.') }).put("artist", c.getString(2).orEmpty().ifBlank { "未知歌手" })
                    .put("album", c.getString(3).orEmpty()).put("durationMs", c.getLong(4)).put("format", format.uppercase(Locale.ROOT))
                    .put("origin", origin(path)))
                entries.last().put("category", if(origin(path) == "网易云下载") "netease" else "device")
            }
        }
        save(entries.distinctBy { it.getLong("id") }); return catalog("手机音乐扫描完成")
    }
    private fun origin(path: String) = if (listOf("netease", "cloudmusic", "网易云").any { path.contains(it, true) }) "网易云下载" else "手机本地"
    fun importFiles(uris: List<Uri>, category: String = "device"): JSONObject {
        require(category in setOf("device", "netease"))
        val entries = saved().associateBy { it.getLong("id") }.toMutableMap(); var added = 0; var skipped = 0; var reason = ""
        for (uri in uris.take(LIMIT)) {
            if (entries.size >= LIMIT && idFor(uri.toString()) !in entries) break
            try { val entry = importFile(uri); if (entry == null) { skipped++; continue }; val target = if(entry.optBoolean("ncm") || category == "netease") "netease" else "device"; entry.put("category", target).put("origin", if(target == "netease") "网易云下载" else "手机本地"); entries[entry.getLong("id")] = entry; added++ }
            catch (e: Exception) { skipped++; reason = e.message.orEmpty().take(90) }
        }
        save(entries.values.toList())
        return catalog(if (added == 0 && skipped > 0) reason.ifBlank { "没有可导入的音频，请选择 MP3、FLAC、M4A、WAV 或标准 NCM" } else "已导入 $added 首" + if (skipped > 0) "，跳过 $skipped 个无法读取的文件" else "")
    }
    fun importFolder(tree: Uri, category: String = "device"): JSONObject {
        require(tree.scheme == "content") { "请选择系统文件夹" }
        runCatching { resolver.takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        val files = mutableListOf<Uri>(); var visited = 0
        fun visit(id: String, depth: Int) {
            if (depth > 8 || files.size >= LIMIT || visited > 20000) return
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, id)
            resolver.query(children, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
                while (c.moveToNext() && files.size < LIMIT && visited++ < 20000) {
                    val child = c.getString(0); if (c.getString(1) == DocumentsContract.Document.MIME_TYPE_DIR) visit(child, depth + 1)
                    else if (c.getString(2).orEmpty().substringAfterLast('.', "").lowercase(Locale.ROOT) in formats) files.add(DocumentsContract.buildDocumentUriUsingTree(tree, child))
                }
            }
        }
        visit(DocumentsContract.getTreeDocumentId(tree), 0); return importFiles(files, category)
    }
    private fun importFile(uri: Uri): JSONObject? {
        require(uri.scheme == "content") { "仅支持系统文件选择器中的文件" }
        var name = ""; var size = -1L
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c -> if (c.moveToFirst()) { name = c.getString(0).orEmpty(); if (!c.isNull(1)) size = c.getLong(1) } }
        val extension = name.substringAfterLast('.', "").lowercase(Locale.ROOT); if (extension !in formats) return null
        if (size > 512L * 1024 * 1024) throw IOException("单个音乐文件不能超过 512 MB")
        if (size > 0 && directory.usableSpace < size + 32 * 1024 * 1024) throw IOException("手机可用空间不足，无法保存离线副本")
        val id = idFor(uri.toString()); val destination = File(directory, "$id.$extension"); val temp = File(directory, "$id.part")
        try {
            resolver.openInputStream(uri)?.use { input -> temp.outputStream().buffered().use { output ->
                val buffer = ByteArray(65536); var total = 0L
                while (true) { val n = input.read(buffer); if (n < 0) break; if (n == 0) continue; total += n; if (total > 512L * 1024 * 1024) throw IOException("音乐文件过大"); output.write(buffer, 0, n) }
                if (total == 0L) throw IOException("文件为空")
            } } ?: throw IOException("无法读取文件，请重新选择")
            var title = name.substringBeforeLast('.'); var artist = "未知歌手"; var album = ""; var duration = 0L; var format = extension
            if (extension == "ncm") {
                val metadata = temp.inputStream().buffered().use { NcmDecoder.header(it).metadata }
                val m = runCatching { JSONObject(metadata) }.getOrDefault(JSONObject())
                title = m.optString("musicName").ifBlank { title }; album = m.optString("album"); duration = m.optLong("duration")
                val list = m.optJSONArray("artist") ?: JSONArray(); artist = (0 until list.length()).mapNotNull { list.optJSONArray(it)?.optString(0) }.joinToString(" / ").ifBlank { artist }
                format = m.optString("format").ifBlank { "NCM" }
            } else {
                val metadata = MediaMetadataRetriever()
                try { metadata.setDataSource(temp.absolutePath); title = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE)?.takeIf { it.isNotBlank() } ?: title
                    artist = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST)?.takeIf { it.isNotBlank() } ?: artist
                    album = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM).orEmpty(); duration = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0
                } finally { metadata.release() }
            }
            if (!temp.renameTo(destination)) throw IOException("无法保存离线音乐")
            File(decoded, "$id.audio").delete()
            return JSONObject().put("id", id).put("uri", Uri.fromFile(destination).toString()).put("imported", true).put("ncm", extension == "ncm")
                .put("name", title.take(1000)).put("artist", artist.take(1000)).put("album", album.take(1000)).put("durationMs", duration)
                .put("format", format.uppercase(Locale.ROOT).take(12)).put("origin", if (extension == "ncm") "网易云下载" else origin(uri.toString()))
        } finally { temp.delete() }
    }
    fun track(id: Long): MusicTrack {
        val entry = saved().firstOrNull { it.optLong("id") == id } ?: throw IOException("本地音乐不存在，请重新扫描或导入")
        return trackFromJson(publicTrack(entry))
    }
    fun removeImported(ids: Set<Long>) {
        val entries = saved()
        for (entry in entries.filter { it.optBoolean("imported") && it.optLong("id") in ids }) {
            val uri = Uri.parse(entry.getString("uri")); val file = File(uri.path ?: "").canonicalFile
            if (uri.scheme == "file" && file.parentFile == directory.canonicalFile) file.delete()
            File(decoded, "${entry.getLong("id")}.audio").delete()
        }
        save(entries.filterNot { it.optBoolean("imported") && it.optLong("id") in ids })
    }
    fun playbackUri(id: Long): Uri {
        val entry = saved().firstOrNull { it.optLong("id") == id } ?: throw IOException("本地音乐已移除，请重新导入")
        val uri = Uri.parse(entry.getString("uri"))
        if (!entry.optBoolean("imported")) {
            if (!hasPermission()) throw IOException("音乐读取权限已关闭，请重新扫描并授权")
            if (uri.scheme != "content" || uri.authority != MediaStore.AUTHORITY) throw IOException("无效的本地音乐来源")
            return uri
        }
        val file = File(uri.path ?: "").canonicalFile
        if (uri.scheme != "file" || file.parentFile != directory.canonicalFile || !file.isFile) throw IOException("离线文件已不存在，请重新导入")
        if (!entry.optBoolean("ncm")) return Uri.fromFile(file)
        val output = File(decoded, "$id.audio")
        if (!output.exists()) {
            if (decoded.usableSpace < file.length() + 32 * 1024 * 1024) throw IOException("空间不足，无法准备 NCM 离线播放")
            val temp = File(decoded, "$id.part")
            try { file.inputStream().buffered().use { input -> temp.outputStream().buffered().use { NcmDecoder.decode(input, it) } }; if (!temp.renameTo(output)) throw IOException("无法准备离线播放") }
            finally { temp.delete() }
            var total = decoded.listFiles()?.sumOf { it.length() } ?: 0L
            for (old in decoded.listFiles().orEmpty().filter { it != output }.sortedBy { it.lastModified() }) { if (total <= 512L * 1024 * 1024) break; val size = old.length(); if (old.delete()) total -= size }
        }
        return Uri.fromFile(output)
    }
}
