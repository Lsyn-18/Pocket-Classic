package com.pocketclassic.player

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
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
import androidx.media3.common.PlaybackException
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ClassicState(
    val page: Page = Page.HOME, val selected: Int = 0, val title: String = "Pocket Classic",
    val playlists: List<MusicPlaylist> = emptyList(), val tracks: List<MusicTrack> = emptyList(),
    val connected: Boolean = false, val nickname: String = "", val busy: Boolean = false,
    val message: String = "", val current: MusicTrack? = null, val playing: Boolean = false,
    val positionMs: Long = 0, val durationMs: Long = 0, val buffering: Boolean = false,
    val dial: DialMode = DialMode.VOLUME, val hold: Boolean = false, val sleeping: Boolean = false,
    val dark: Boolean = false, val haptics: Boolean = true, val volume: Int = 0,
    val shuffle: Boolean = false, val repeat: Int = Player.REPEAT_MODE_OFF, val queueIndex: Int = 0, val queueCount: Int = 0,
    val showConnection: Boolean = false, val showMore: Boolean = false, val endpoint: String = ""
)

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val store = ConnectionStore(application)
    private val audio = application.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var state by mutableStateOf(ClassicState(dark = store.dark, haptics = store.haptics, endpoint = store.read()?.baseUrl ?: ""))
        private set
    private var controller: MediaController? = null
    private var loading: Job? = null
    private var loadGeneration = 0
    private val navigation = mutableListOf<Triple<Page, Int, String>>()
    private val controllerFuture = MediaController.Builder(application, SessionToken(application, ComponentName(application, PlaybackService::class.java))).buildAsync()
    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) { updatePlayback() }
        override fun onPlayerError(error: PlaybackException) {
            state = state.copy(message = error.cause?.message?.take(100) ?: "播放暂时失败，请检查音乐服务连接后重试", buffering = false)
        }
    }
    init {
        controllerFuture.addListener({
            runCatching { controllerFuture.get() }.onSuccess { controller = it; it.addListener(listener); updatePlayback() }
                .onFailure { state = state.copy(message = "播放器未能启动，请重新打开应用") }
        }, ContextCompat.getMainExecutor(application))
        viewModelScope.launch { while (isActive) { updatePlayback(); delay(300) } }
        if (store.read() != null) refreshAccount()
    }
    private fun updatePlayback() {
        val c = controller ?: return
        val item = c.currentMediaItem
        val current = item?.let { MusicTrack(it.mediaId.toLongOrNull() ?: 0, it.mediaMetadata.title?.toString() ?: "", it.mediaMetadata.artist?.toString() ?: "", it.mediaMetadata.extras?.getLong("duration") ?: 0) }
        val duration = c.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: current?.durationMs ?: 0
        state = state.copy(current = current, playing = c.isPlaying, positionMs = c.currentPosition.coerceAtLeast(0), durationMs = duration,
            buffering = c.playbackState == Player.STATE_BUFFERING, volume = volumePercent(), shuffle = c.shuffleModeEnabled, repeat = c.repeatMode,
            queueIndex = c.currentMediaItemIndex.coerceAtLeast(0), queueCount = c.mediaItemCount)
    }
    private fun volumePercent(): Int = (audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100 / audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1))
    private fun api() = GatewayApi(store.read() ?: throw IllegalStateException("请先连接音乐服务"))
    private fun load(block: suspend () -> Unit) {
        val generation = ++loadGeneration
        loading?.cancel()
        loading = viewModelScope.launch {
            state = state.copy(busy = true, message = "")
            try { block() } catch (e: CancellationException) { throw e }
            catch (e: Exception) { state = state.copy(message = e.message?.take(140) ?: "连接失败，请检查电脑服务是否运行") }
            finally { if (generation == loadGeneration) state = state.copy(busy = false) }
        }
    }
    fun refreshAccount() = load {
        val account = withContext(Dispatchers.IO) { api().account() }
        state = state.copy(connected = account.authenticated, nickname = account.nickname,
            message = if (account.authenticated) "" else "请先在电脑端扫码登录网易云音乐")
    }
    fun pair(url: String, code: String) = load {
        val config = withContext(Dispatchers.IO) { GatewayApi.pair(url, code) }
        store.save(config)
        val account = withContext(Dispatchers.IO) { GatewayApi(config).account() }
        state = state.copy(connected = account.authenticated, nickname = account.nickname, endpoint = config.baseUrl,
            showConnection = !account.authenticated, message = if (account.authenticated) "连接成功" else "配对成功，请在电脑端完成网易云扫码登录")
    }
    fun showConnection(show: Boolean = true) { state = state.copy(showConnection = show, message = "") }
    fun disconnect() { controller?.stop(); store.clear(); navigation.clear(); state = state.copy(connected = false, nickname = "", playlists = emptyList(), tracks = emptyList(), page = Page.HOME, selected = 0, endpoint = "", showConnection = false, message = "已断开音乐服务") }
    private fun navigate(page: Page, title: String = "") {
        navigation.add(Triple(state.page, state.selected, state.title))
        state = state.copy(page = page, selected = 0, title = title, message = "", dial = DialMode.VOLUME)
    }
    private fun library() {
        if (!state.connected) { showConnection(); return }
        navigate(Page.PLAYLISTS, "我的歌单")
        load { val list = withContext(Dispatchers.IO) { api().playlists() }; state = state.copy(playlists = list) }
    }
    fun choose(index: Int = state.selected) {
        if (state.hold || state.busy) return
        wake()
        state = state.copy(selected = index)
        when (state.page) {
            Page.HOME -> when (index) { 0 -> library(); 1 -> nowPlaying(); 2 -> { if (state.tracks.isNotEmpty()) { controller?.shuffleModeEnabled = true; playAt(state.tracks.indices.random()) } else library() }; 3 -> navigate(Page.SETTINGS, "设置") }
            Page.PLAYLISTS -> state.playlists.getOrNull(index)?.let { playlist ->
                navigate(Page.TRACKS, playlist.name)
                load { val tracks = withContext(Dispatchers.IO) { api().tracks(playlist.id) }; state = state.copy(tracks = tracks) }
            }
            Page.TRACKS -> playAt(index)
            Page.NOW_PLAYING -> state = state.copy(dial = if (state.dial == DialMode.VOLUME) DialMode.SEEK else DialMode.VOLUME)
            Page.SETTINGS -> when (index) {
                0 -> showConnection()
                1 -> { store.dark = !state.dark; state = state.copy(dark = store.dark) }
                2 -> { store.haptics = !state.haptics; state = state.copy(haptics = store.haptics) }
                3 -> controller?.let { it.shuffleModeEnabled = !it.shuffleModeEnabled }
                4 -> controller?.let { it.repeatMode = (it.repeatMode + 1) % 3 }
                5 -> state = state.copy(message = "Pocket Classic 0.1 · 安卓开发预览版")
            }
        }
    }
    private fun item(track: MusicTrack) = MediaItem.Builder().setMediaId(track.id.toString()).setUri("pocketclassic://track/${track.id}")
        .setMediaMetadata(MediaMetadata.Builder().setTitle(track.name).setArtist(track.artist).setExtras(Bundle().apply { putLong("duration", track.durationMs) }).build()).build()
    private fun playAt(index: Int) {
        val c = controller ?: run { state = state.copy(message = "播放器准备中，请稍后再试"); return }
        if (index !in state.tracks.indices) return
        c.setMediaItems(state.tracks.map(::item), index, 0L); c.prepare(); c.play()
        state = state.copy(message = "")
        nowPlaying()
    }
    fun nowPlaying() { if (state.current == null && controller?.mediaItemCount == 0) { state = state.copy(message = "先从音乐菜单选择一首歌"); return }; if (state.page != Page.NOW_PLAYING) navigate(Page.NOW_PLAYING, "正在播放") }
    fun menu(home: Boolean = false) {
        if (state.hold) return
        if (state.sleeping) { wake(); return }
        ++loadGeneration
        loading?.cancel()
        if (home || navigation.isEmpty()) { navigation.clear(); state = state.copy(page = Page.HOME, selected = 0, title = "Pocket Classic", message = "", busy = false); return }
        val (page, index, title) = navigation.removeAt(navigation.lastIndex)
        state = state.copy(page = page, selected = index, title = title, message = "", busy = false)
    }
    fun rotate(steps: Int) {
        if (state.hold || state.busy || steps == 0) return
        if (state.sleeping) { wake(); return }
        if (state.page == Page.NOW_PLAYING) {
            if (state.dial == DialMode.SEEK) seekBy(steps * 3000L)
            else { repeat(kotlin.math.abs(steps).coerceAtMost(4)) { audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (steps > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, 0) }; state = state.copy(volume = volumePercent()) }
        } else {
            val count = when (state.page) { Page.HOME -> 4; Page.PLAYLISTS -> state.playlists.size; Page.TRACKS -> state.tracks.size; Page.SETTINGS -> 6; else -> 0 }
            state = state.copy(selected = (state.selected + steps).coerceIn(0, (count - 1).coerceAtLeast(0)))
        }
    }
    fun togglePlayback() {
        if (state.hold || state.busy) return
        if (state.sleeping) { wake(); return }
        if (state.page == Page.TRACKS) { playAt(state.selected); return }
        if (state.page == Page.PLAYLISTS) {
            val playlist = state.playlists.getOrNull(state.selected) ?: return
            load { val tracks = withContext(Dispatchers.IO) { api().tracks(playlist.id) }; state = state.copy(tracks = tracks); playAt(0) }
            return
        }
        controller?.let { if (it.isPlaying || it.playWhenReady) it.pause() else if (it.mediaItemCount > 0) { it.prepare(); it.play() } else choose() }
    }
    fun next() { if (!state.hold) controller?.let { if (it.hasNextMediaItem()) it.seekToNextMediaItem() } }
    fun previous() { if (!state.hold) controller?.let { if (it.currentPosition > 3000) it.seekTo(0) else if (it.hasPreviousMediaItem()) it.seekToPreviousMediaItem() else it.seekTo(0) } }
    fun seekBy(delta: Long) { if (!state.hold) controller?.let { c -> c.seekTo((c.currentPosition + delta).coerceIn(0, c.duration.takeIf { it > 0 } ?: state.durationMs.coerceAtLeast(0))) } }
    fun hold() { state = state.copy(hold = !state.hold) }
    fun sleep() { if (!state.hold) { controller?.pause(); state = state.copy(sleeping = true) } }
    fun wake() { if (state.sleeping) state = state.copy(sleeping = false) }
    fun more(show: Boolean = true) { if (!state.hold) state = state.copy(showMore = show) }
    fun retry() { state = state.copy(message = ""); controller?.prepare(); controller?.play() }
    override fun onCleared() { controller?.removeListener(listener); MediaController.releaseFuture(controllerFuture); super.onCleared() }
}
