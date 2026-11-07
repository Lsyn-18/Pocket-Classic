package com.pocketclassic.player

import kotlin.math.PI
import org.json.JSONObject

data class MusicPlaylist(val id: Long, val name: String, val trackCount: Int)
data class MusicTrack(val id: Long, val name: String, val artist: String, val durationMs: Long, val fee: Int = 0, val cover: String = "", val album: String = "", val local: Boolean = false, val origin: String = "", val format: String = "")
data class PlayResource(val url: String, val trial: Boolean, val durationMs: Long, val level: String = "")
enum class Page { HOME, PLAYLISTS, TRACKS, NOW_PLAYING, SETTINGS }
enum class DialMode { VOLUME, SEEK }

fun normalizedAngleDelta(previous: Float, current: Float): Float {
    var delta = current - previous
    while (delta > PI) delta -= (2 * PI).toFloat()
    while (delta < -PI) delta += (2 * PI).toFloat()
    return delta
}
fun formatTime(ms: Long): String {
    val seconds = (ms.coerceAtLeast(0) / 1000).toInt()
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
fun trackFromJson(o: JSONObject) = MusicTrack(o.getLong("id"), o.optString("name", "未知歌曲"), o.optString("artist", "未知歌手"), o.optLong("durationMs"), o.optInt("fee"), ArtworkPolicy.url(o.optString("cover")) ?: "", o.optString("album").take(1000), o.optBoolean("local"), o.optString("origin").take(100), o.optString("format").take(12))
