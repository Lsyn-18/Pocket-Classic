package com.pocketclassic.player

import kotlin.math.PI
import org.json.JSONObject

data class MusicPlaylist(val id: Long, val name: String, val trackCount: Int)
data class MusicTrack(val id: Long, val name: String, val artist: String, val durationMs: Long, val fee: Int = 0)
data class ConnectionConfig(val baseUrl: String, val token: String)
data class AccountInfo(val authenticated: Boolean, val nickname: String, val message: String)
data class PlayResource(val url: String, val trial: Boolean, val durationMs: Long)
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
fun trackFromJson(o: JSONObject) = MusicTrack(o.getLong("id"), o.optString("name", "未知歌曲"), o.optString("artist", "未知歌手"), o.optLong("durationMs"), o.optInt("fee"))
