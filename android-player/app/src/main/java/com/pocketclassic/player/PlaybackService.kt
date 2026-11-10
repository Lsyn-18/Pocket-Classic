package com.pocketclassic.player

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionError
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException

@UnstableApi
class PlaybackService : MediaSessionService() {
    companion object {
        // Display metadata only: no resource URLs or account credentials cross the bridge.
        private val resolvedQuality = java.util.concurrent.ConcurrentHashMap<Long,String>()
        fun qualityFor(id: Long): String = resolvedQuality[id] ?: ""
        fun clearQuality() = resolvedQuality.clear()
    }
    private var session: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val radio = RadioContinuation()
    private var radioJob: Job? = null
    private var advanceFrom: String? = null
    private var finiteJob: Job? = null
    private var finiteSession = ""
    private var finiteAdvanceFrom: String? = null
    private lateinit var store: MusicSessionStore
    private lateinit var api: NetEaseApi

    override fun onCreate() {
        super.onCreate()
        clearQuality()
        PlaybackProblems.clear()
        store = MusicSessionStore(this); api = NetEaseApi(store)
        val localMusic = LocalMusicLibrary(this)
        val factory = musicDataSources(this, localMusic, { id ->
            val resource = api.resolve(id)
            if (resolvedQuality.size > 100) resolvedQuality.clear()
            resolvedQuality[id] = resource.level; resource.url
        })
        val player = ExoPlayer.Builder(this).setMediaSourceFactory(DefaultMediaSourceFactory(factory)).build().apply {
            volume = 1f
            setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            setHandleAudioBecomingNoisy(true)
            setWakeMode(C.WAKE_MODE_NETWORK)
        }
        val callback = object : MediaSession.Callback {
            override fun onConnect(mediaSession: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
                if (controller.packageName != packageName && !controller.isTrusted) return MediaSession.ConnectionResult.reject()
                val base = super.onConnect(mediaSession, controller)
                val commands = base.availableSessionCommands.buildUpon()
                if (controller.packageName == packageName) commands.add(SessionCommand(NativeContract.NEXT, Bundle.EMPTY))
                return MediaSession.ConnectionResult.accept(commands.build(), base.availablePlayerCommands)
            }
            override fun onCustomCommand(mediaSession: MediaSession, controller: MediaSession.ControllerInfo, command: SessionCommand, args: Bundle): ListenableFuture<SessionResult> {
                if (command.customAction != NativeContract.NEXT || controller.packageName != packageName)
                    return Futures.immediateFuture(SessionResult(SessionError.ERROR_NOT_SUPPORTED))
                val paged=PagedQueues.forSession(player.currentMediaItem?.mediaMetadata?.extras?.getString("queueSession"))
                if(args.getBoolean("retryOnly")) { if(paged!=null)refillFinite(player,true) }
                else if (player.hasNextMediaItem()) player.seekToNextMediaItem()
                else if(paged!=null) { finiteAdvanceFrom=player.currentMediaItem?.mediaId;refillFinite(player,true) }
                else { advanceFrom = player.currentMediaItem?.mediaId; refill(player) }
                return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
            }
        }
        val launch = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        session = MediaSession.Builder(this, player).setCallback(callback).setSessionActivity(launch).build()
        player.addListener(object : Player.Listener {
            override fun onEvents(p: Player, events: Player.Events) {
                val key = p.currentMediaItem?.mediaMetadata?.extras?.getString("queueSession") ?: ""
                PlaybackProblems.observe(key,p.currentMediaItem?.mediaId?:"",p.playerError)
                if (radio.switchSession(key)) { radioJob?.cancel(); radioJob = null; advanceFrom = null; session?.setSessionExtras(Bundle.EMPTY) }
                if(finiteSession!=key) { finiteSession=key;finiteJob?.cancel();finiteJob=null;finiteAdvanceFrom=null }
                if(p.playWhenReady && (p.shuffleModeEnabled || p.mediaItemCount-p.currentMediaItemIndex<=5))refillFinite(player)
                if (p.currentMediaItem?.mediaMetadata?.extras?.getString("mode") == "roam" && p.playWhenReady &&
                    p.mediaItemCount - p.currentMediaItemIndex <= 2) refill(player)
            }
        })
    }
    private fun refillFinite(player: ExoPlayer, force: Boolean=false) {
        val key=player.currentMediaItem?.mediaMetadata?.extras?.getString("queueSession")?:return
        val context=PagedQueues.forSession(key)?:return
        if(player.mediaItemCount>=5000)return
        val ticket=context.cursor.begin(force)?:return
        finiteJob=scope.launch {
            var succeeded=false
            try {
                if(store.read()?.id!=context.source.account)throw IOException("登录已变化，请重新连接并选择歌单")
                val batch=withContext(Dispatchers.IO) { context.source.load(ticket.offset) }
                if(PagedQueues.forSession(key)!==context || player.currentMediaItem?.mediaMetadata?.extras?.getString("queueSession")!=key || store.read()?.id!=context.source.account)return@launch
                val seen=(0 until player.mediaItemCount).mapNotNull { player.getMediaItemAt(it).mediaId.toLongOrNull() }.toMutableSet()
                val fresh=batch.tracks.filter { it.id>0 && seen.add(it.id) }.take(5000-player.mediaItemCount)
                if(!context.cursor.accept(ticket,batch.nextOffset,batch.more,player.mediaItemCount+fresh.size))return@launch
                val advance=player.playbackState==Player.STATE_ENDED || finiteAdvanceFrom==player.currentMediaItem?.mediaId
                finiteAdvanceFrom=null
                if(fresh.isNotEmpty())player.addMediaItems(fresh.map { mediaItem(it,player.currentMediaItem?.mediaMetadata?.extras?.getString("mode")?:"playlist",key) })
                if(!context.cursor.more)player.repeatMode=context.repeat
                if(advance && player.hasNextMediaItem()){player.seekToNextMediaItem();player.prepare();player.play()}
                succeeded=true
            } catch(e: CancellationException) { throw e }
            catch(e: Exception) { if(PagedQueues.forSession(key)===context)context.cursor.fail(ticket,e.message?:"歌单续载失败，请重试") }
            finally { context.cursor.finish(ticket) }
            if(succeeded && PagedQueues.forSession(key)===context && context.cursor.more && player.playWhenReady && (player.shuffleModeEnabled || player.mediaItemCount-player.currentMediaItemIndex<=5))refillFinite(player)
        }
    }
    private fun refill(player: ExoPlayer) {
        val extra = player.currentMediaItem?.mediaMetadata?.extras ?: return
        if (extra.getString("mode") != "roam") return
        val key = extra.getString("queueSession") ?: return
        radio.switchSession(key)
        val existing = (0 until player.mediaItemCount).mapNotNull { player.getMediaItemAt(it).mediaId.toLongOrNull() }
        val ticket = radio.begin(existing) ?: return
        val config = store.read() ?: run { radio.finish(ticket); return }
        radioJob = scope.launch {
            try {
                var fresh = emptyList<MusicTrack>()
                for (attempt in 0 until 3) {
                    val batch = withContext(Dispatchers.IO) { api.roaming() }
                    if (!radio.current(ticket) || player.currentMediaItem?.mediaMetadata?.extras?.getString("queueSession") != key || store.read() != config) return@launch
                    fresh = radio.accept(ticket, batch)
                    if (fresh.isNotEmpty() || batch.isEmpty()) break
                }
                if (fresh.isEmpty()) throw IOException("暂时没有新的漫游推荐，按下一首重试")
                val advance = player.playbackState == Player.STATE_ENDED || advanceFrom == player.currentMediaItem?.mediaId
                advanceFrom = null
                player.addMediaItems(fresh.map { mediaItem(it, "roam", key) })
                if (player.currentMediaItemIndex > 40) player.removeMediaItems(0, player.currentMediaItemIndex - 20)
                session?.setSessionExtras(Bundle.EMPTY)
                if (advance && player.hasNextMediaItem()) { player.seekToNextMediaItem(); player.prepare(); player.play() }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (radio.current(ticket)) session?.setSessionExtras(Bundle().apply {
                    putString("roamSession", key); putString("roamError", "漫游续歌暂不可用，请按下一首重试")
                })
            } finally { radio.finish(ticket) }
        }
    }
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session
    override fun onDestroy() { scope.cancel();PagedQueues.clear();PlaybackProblems.clear(); session?.run { player.release(); release() }; session = null; super.onDestroy() }
}
