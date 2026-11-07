package com.pocketclassic.player

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Color
import android.os.SystemClock
import android.content.ComponentName
import android.os.Bundle
import android.net.Uri
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

data class ClassicState(
    val connected: Boolean = false, val nickname: String = "", val busy: Boolean = false,
    val message: String = "", val showConnection: Boolean = false, val qrImage: Bitmap? = null,
    val loginUrl: String = "", val loginPhase: String = "idle", val theme: String = "auto"
)

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val store = MusicSessionStore(application)
    private val api = NetEaseApi(store)
    val localMusic = LocalMusicLibrary(application)
    private var loginJob: Job? = null
    private var loginGeneration = 0L
    var state by mutableStateOf(ClassicState(theme = store.theme))
        private set
    private var controller: MediaController? = null
    private var loading: Job? = null
    private var loadGeneration = 0L
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
        val generation=++loadGeneration
        loading = viewModelScope.launch {
            state = state.copy(busy = true, message = "")
            try { block() } catch (e: CancellationException) { throw e }
            catch (e: Exception) { if(generation==loadGeneration)state = state.copy(message = e.message?.take(140) ?: "连接失败，请检查手机网络") }
            finally { if(generation==loadGeneration)state = state.copy(busy = false) }
        }
    }
    fun refreshAccount() = load {
        val account = withContext(Dispatchers.IO) { api.status() }
        state = state.copy(connected = account.optBoolean("authenticated"), nickname = account.optString("nickname"),message = account.optString("message"))
    }
    fun beginLogin() {
        loadGeneration++;loading?.cancel()
        loginJob?.cancel(); val generation=++loginGeneration
        state=state.copy(showConnection=true,busy=true,qrImage=null,loginUrl="",loginPhase="creating",message="正在向网易云申请登录授权…")
        loginJob=viewModelScope.launch {
            try {
                val ticket=withContext(Dispatchers.IO) { api.beginLogin() }
                val image=withContext(Dispatchers.Default) {
                    val matrix=QRCodeWriter().encode(ticket.url,BarcodeFormat.QR_CODE,440,440)
                    Bitmap.createBitmap(440,440,Bitmap.Config.ARGB_8888).apply { setPixels(IntArray(440*440) { if(matrix[it%440,it/440])Color.BLACK else Color.WHITE },0,440,0,0,440,440) }
                }
                if(generation!=loginGeneration)return@launch
                state=state.copy(busy=false,qrImage=image,loginUrl=ticket.url,loginPhase="waiting",message="请在网易云音乐中确认授权，完成后返回这里")
                val deadline=SystemClock.elapsedRealtime()+180_000
                while(generation==loginGeneration && SystemClock.elapsedRealtime()<deadline) {
                    delay(2300)
                    val result=withContext(Dispatchers.IO) { api.pollLogin(ticket) }
                    if(generation!=loginGeneration)return@launch
                    when(result.code) {
                        803 -> {
                            val session=result.session?:throw IOException("未能确认登录，请重试")
                            if(generation!=loginGeneration)return@launch
                            store.save(session)
                            connectionGeneration++;controller?.stop();controller?.clearMediaItems()
                            state=state.copy(connected=true,nickname=session.nickname,busy=false,showConnection=false,qrImage=null,loginUrl="",loginPhase="authorized",message="网易云已登录，手机可独立播放")
                            return@launch
                        }
                        800 -> break
                        802 -> state=state.copy(loginPhase="confirm",message="请在网易云音乐中确认登录")
                        801 -> Unit
                        else -> throw IOException("网易云授权暂不可用，请重新生成二维码")
                    }
                }
                state=state.copy(qrImage=null,loginUrl="",loginPhase="expired",message="授权已过期，请重新生成")
            } catch(e: CancellationException) { throw e }
            catch(e: Exception) { if(generation==loginGeneration)state=state.copy(busy=false,loginPhase="error",message=e.message?.take(140)?:"登录失败，请检查手机网络") }
        }
    }
    fun showConnection(show: Boolean = true) {
        state=state.copy(showConnection=show)
        if(!show) { loginGeneration++;loginJob?.cancel();state=state.copy(qrImage=null,loginUrl="",busy=false) }
        else if(!state.connected && !loginJob.let { it?.isActive==true })beginLogin()
    }
    fun disconnect() {
        PlaybackService.clearQuality()
        connectionGeneration++;loginGeneration++;loadGeneration++;loginJob?.cancel();loading?.cancel(); if (controller?.currentMediaItem?.mediaMetadata?.extras?.getString("mode") != "local") { controller?.stop(); controller?.clearMediaItems() }; store.clear()
        state = ClassicState(message = "已退出网易云音乐", theme = store.theme)
    }
    suspend fun browserApi(route: String): JSONObject {
        if (!NativeContract.allowedApi(route)) throw IOException("不支持此音乐操作")
        if (route == "local") return withContext(Dispatchers.IO) { localMusic.catalog() }
        val generation = connectionGeneration
        val result = withContext(Dispatchers.IO) { api.browserApi(route) }
        if (generation != connectionGeneration) throw IOException("连接已变化，请重新打开音乐菜单")
        return result
    }
    suspend fun startQueue(data: JSONObject) {
        PlaybackService.clearQuality()
        val tracks = data.getJSONArray("tracks")
        require(tracks.length() in 1..5000) { "播放列表过长或为空" }
        val index = data.getInt("index"); require(index in 0 until tracks.length())
        val mode = data.optString("mode", "playlist"); require(NativeContract.validMode(mode))
        if (mode != "local") require(store.read() != null) { "请先登录网易云音乐" }
        val quality=data.optString("quality",store.quality);require(MusicQuality.valid(quality)) { "无效音质" };store.quality=quality
        val session = UUID.randomUUID().toString()
        val items = withContext(Dispatchers.IO) { List(tracks.length()) {
            val requested = tracks.getJSONObject(it)
            val track = if (mode == "local") localMusic.track(requested.getLong("id")) else trackFromJson(requested).copy(local = false, origin = "", format = "")
            require((if (mode == "local") track.id < 0 else track.id > 0) && track.name.length <= 1000 && track.artist.length <= 1000)
            mediaItem(track, mode, session)
        } }
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
    fun preferences(data: JSONObject) { val quality=data.optString("quality",store.quality);require(MusicQuality.valid(quality));store.dark = data.optBoolean("dark"); store.haptics = data.optBoolean("haptics", true);store.quality=quality
        val theme=data.optString("theme",store.theme);require(theme in setOf("auto","light","dark"));store.theme=theme;store.largeText=data.optBoolean("largeText",store.largeText);store.reducedMotion=data.optBoolean("reducedMotion",store.reducedMotion);if(state.theme!=theme)state=state.copy(theme=theme)
    }
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
            .put("quality",store.quality)
            .put("theme",store.theme).put("largeText",store.largeText).put("reducedMotion",store.reducedMotion)
            .put("actualQuality",if(c?.playbackState==Player.STATE_READY) { if (extra?.getString("mode") == "local") "offline" else PlaybackService.qualityFor(item?.mediaId?.toLongOrNull() ?: 0L) } else "")
            .put("current", item?.let(::trackJson) ?: JSONObject.NULL)
            .put("error", c?.playerError?.cause?.message?.take(140) ?: c?.playerError?.message?.take(140) ?: radioError ?: "")
        if (includeQueue) result.put("tracks", JSONArray().apply { if (c != null) for (i in 0 until c.mediaItemCount) put(trackJson(c.getMediaItemAt(i))) })
        return result
    }
    override fun onCleared() { controller?.removeListener(listener); MediaController.releaseFuture(controllerFuture); super.onCleared() }
}

fun mediaItem(track: MusicTrack, mode: String, session: String): MediaItem = MediaItem.Builder()
    .setMediaId(track.id.toString()).setUri("pocketclassic://" + (if(track.local) "local/" else "track/") + track.id)
    .setMediaMetadata(MediaMetadata.Builder().setTitle(track.name).setArtist(track.artist)
        .setAlbumTitle(track.album).setArtworkUri(ArtworkPolicy.url(track.cover)?.let(Uri::parse))
        .setExtras(Bundle().apply { putLong("duration", track.durationMs); putString("mode", mode); putString("queueSession", session); putBoolean("local", track.local); putString("origin", track.origin); putString("format", track.format) }).build()).build()

fun trackJson(item: MediaItem): JSONObject = JSONObject().put("id", item.mediaId.toLongOrNull() ?: 0)
    .put("name", item.mediaMetadata.title?.toString() ?: "").put("artist", item.mediaMetadata.artist?.toString() ?: "")
    .put("durationMs", item.mediaMetadata.extras?.getLong("duration") ?: 0)
    .put("cover", item.mediaMetadata.artworkUri?.toString() ?: "").put("album", item.mediaMetadata.albumTitle?.toString() ?: "")
    .put("local", item.mediaMetadata.extras?.getBoolean("local") ?: false).put("origin", item.mediaMetadata.extras?.getString("origin") ?: "").put("format", item.mediaMetadata.extras?.getString("format") ?: "")
