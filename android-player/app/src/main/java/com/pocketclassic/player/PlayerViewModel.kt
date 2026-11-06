package com.pocketclassic.player

import android.app.Application
import android.content.ComponentName
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

data class ClassicState(
    val connected: Boolean = false, val nickname: String = "", val busy: Boolean = false,
    val message: String = "", val showConnection: Boolean = false, val endpoint: String = ""
)

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val store = ConnectionStore(application)
    var state by mutableStateOf(ClassicState(endpoint = store.read()?.baseUrl ?: ""))
        private set
    private var controller: MediaController? = null
    private var loading: Job? = null
    private var connectionGeneration = 0L
    var queueRevision = 0L
        private set
    private val controllerFuture = MediaController.Builder(application,
        SessionToken(application, ComponentName(application, PlaybackService::class.java))).buildAsync()
    private val listener = object : Player.Listener {
        override fun onTimelineChanged(timeline: Timeline, reason: Int) { queueRevision++ }
    }
    init {
        controllerFuture.addListener({
            runCatching { controllerFuture.get() }.onSuccess { controller = it; it.addListener(listener); queueRevision++ }
                .onFailure { state = state.copy(message = "播放器未能启动，请重新打开应用") }
        }, ContextCompat.getMainExecutor(application))
        if (store.read() != null) refreshAccount()
    }
    private suspend fun player(): MediaController {
        controller?.let { return it }
        return withContext(Dispatchers.IO) { controllerFuture.get(15, TimeUnit.SECONDS) }
    }
    private fun load(block: suspend () -> Unit) {
        loading?.cancel()
        loading = viewModelScope.launch {
            state = state.copy(busy = true, message = "")
            try { block() } catch (e: CancellationException) { throw e }
            catch (e: Exception) { state = state.copy(message = e.message?.take(140) ?: "连接失败，请检查电脑服务") }
            finally { state = state.copy(busy = false) }
        }
    }
    fun refreshAccount() = load {
        val config = store.read() ?: return@load
        val account = withContext(Dispatchers.IO) { GatewayApi(config).account() }
        state = state.copy(connected = account.authenticated, nickname = account.nickname,
            message = if (account.authenticated) "" else "请先在电脑端扫码登录网易云音乐")
    }
    fun pair(url: String, code: String) = load {
        val config = withContext(Dispatchers.IO) { GatewayApi.pair(url, code) }
        connectionGeneration++; controller?.stop(); controller?.clearMediaItems(); store.save(config)
        val account = withContext(Dispatchers.IO) { GatewayApi(config).account() }
        state = state.copy(connected = account.authenticated, nickname = account.nickname, endpoint = config.baseUrl,
            showConnection = !account.authenticated, message = if (account.authenticated) "连接成功" else "配对成功，请先在电脑端扫码登录")
    }
    fun showConnection(show: Boolean = true) { state = state.copy(showConnection = show, message = "") }
    fun disconnect() {
        connectionGeneration++; loading?.cancel(); controller?.stop(); controller?.clearMediaItems(); store.clear()
        state = ClassicState(message = "已断开音乐服务")
    }
    suspend fun browserApi(route: String): JSONObject {
        if (!NativeContract.allowedApi(route)) throw IOException("不支持此音乐操作")
        val config = store.read()
        if (config == null && route == "status") return JSONObject().put("authenticated", false).put("nickname", "").put("message", "请先配对电脑上的音乐服务")
        if (config == null) throw IOException("请先连接音乐服务")
        val generation = connectionGeneration
        val result = withContext(Dispatchers.IO) { GatewayApi(config).browserApi(route) }
        if (generation != connectionGeneration) throw IOException("连接已变化，请重新打开音乐菜单")
        return result
    }
    suspend fun startQueue(data: JSONObject) {
        val tracks = data.getJSONArray("tracks")
        require(tracks.length() in 1..5000) { "播放列表过长或为空" }
        val index = data.getInt("index"); require(index in 0 until tracks.length())
        val mode = data.optString("mode", "playlist"); require(NativeContract.validMode(mode))
        require(store.read() != null) { "请先连接音乐服务" }
        val session = UUID.randomUUID().toString()
        val items = List(tracks.length()) {
            val track = trackFromJson(tracks.getJSONObject(it))
            require(track.id > 0 && track.name.length <= 1000 && track.artist.length <= 1000)
            mediaItem(track, mode, session)
        }
        val c = player()
        c.shuffleModeEnabled = mode != "roam" && data.optBoolean("shuffle")
        c.repeatMode = if (mode == "roam") Player.REPEAT_MODE_OFF else data.optInt("repeat").coerceIn(0,2)
        c.volume = data.optDouble("volume", .65).toFloat().coerceIn(0f,1f)
        c.setMediaItems(items, index, 0L); c.prepare(); c.play()
    }
    suspend fun command(method: String, args: JSONObject) {
        val c = player()
        when (method) {
            "play" -> { require(c.mediaItemCount > 0) { "先从音乐菜单选择歌曲" }; c.prepare(); c.play() }
            "pause" -> c.pause()
            "next" -> {
                if (c.hasNextMediaItem()) c.seekToNextMediaItem()
                else if (c.currentMediaItem?.mediaMetadata?.extras?.getString("mode") == "roam")
                    c.sendCustomCommand(SessionCommand(NativeContract.NEXT, Bundle.EMPTY), Bundle.EMPTY)
            }
            "previous" -> if (c.currentPosition > 3000 || !c.hasPreviousMediaItem()) c.seekTo(0) else c.seekToPreviousMediaItem()
            "seek" -> c.seekTo(args.optLong("positionMs").coerceIn(0, c.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: Long.MAX_VALUE))
            "volume" -> c.volume = args.optDouble("value", .65).toFloat().coerceIn(0f,1f)
            "configure" -> if (c.currentMediaItem?.mediaMetadata?.extras?.getString("mode") != "roam") {
                c.shuffleModeEnabled = args.optBoolean("shuffle")
                c.repeatMode = args.optInt("repeat").coerceIn(0,2)
            }
        }
    }
    fun preferences(data: JSONObject) { store.dark = data.optBoolean("dark"); store.haptics = data.optBoolean("haptics", true) }
    fun snapshot(includeQueue: Boolean): JSONObject {
        val c = controller; val item = c?.currentMediaItem; val extra = item?.mediaMetadata?.extras
        val duration = c?.duration?.takeIf { it > 0 && it != C.TIME_UNSET } ?: 0
        val radioError = if (c?.sessionExtras?.getString("roamSession") == extra?.getString("queueSession")) c?.sessionExtras?.getString("roamError", "") else ""
        val result = JSONObject().put("positionMs", c?.currentPosition?.coerceAtLeast(0) ?: 0).put("durationMs", duration)
            .put("playing", c?.playWhenReady ?: false).put("ready", c?.playbackState == Player.STATE_READY)
            .put("buffering", c?.playbackState == Player.STATE_BUFFERING).put("volume", c?.volume ?: .65f)
            .put("index", c?.currentMediaItemIndex?.coerceAtLeast(0) ?: 0).put("count", c?.mediaItemCount ?: 0)
            .put("mode", extra?.getString("mode") ?: "playlist").put("shuffle", c?.shuffleModeEnabled ?: false)
            .put("repeat", c?.repeatMode ?: 0).put("dark", store.dark).put("haptics", store.haptics)
            .put("current", item?.let(::trackJson) ?: JSONObject.NULL)
            .put("error", c?.playerError?.cause?.message?.take(140) ?: c?.playerError?.message?.take(140) ?: radioError ?: "")
        if (includeQueue) result.put("tracks", JSONArray().apply { if (c != null) for (i in 0 until c.mediaItemCount) put(trackJson(c.getMediaItemAt(i))) })
        return result
    }
    override fun onCleared() { controller?.removeListener(listener); MediaController.releaseFuture(controllerFuture); super.onCleared() }
}

fun mediaItem(track: MusicTrack, mode: String, session: String): MediaItem = MediaItem.Builder()
    .setMediaId(track.id.toString()).setUri("pocketclassic://track/" + track.id)
    .setMediaMetadata(MediaMetadata.Builder().setTitle(track.name).setArtist(track.artist)
        .setExtras(Bundle().apply { putLong("duration", track.durationMs); putString("mode", mode); putString("queueSession", session) }).build()).build()

fun trackJson(item: MediaItem): JSONObject = JSONObject().put("id", item.mediaId.toLongOrNull() ?: 0)
    .put("name", item.mediaMetadata.title?.toString() ?: "").put("artist", item.mediaMetadata.artist?.toString() ?: "")
    .put("durationMs", item.mediaMetadata.extras?.getLong("duration") ?: 0)
