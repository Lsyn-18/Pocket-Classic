package com.pocketclassic.player

import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** Android Bundle contract only. No account, network, audio, or library changes. */
@RunWith(AndroidJUnit4::class)
@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackProblemDeviceTest {
    @Test fun playbackSerializationRetainsTheActionableFailureReason() {
        val source=PlaybackException("Source error",MusicProblem("unavailable","这首歌暂时无法播放"),PlaybackException.ERROR_CODE_IO_UNSPECIFIED)
        val received=PlaybackException.fromBundle(source.toBundle())
        // This is the actual library boundary, not a fabricated Throwable copy.
        assertEquals(source.timestampMs,received.timestampMs)
        try {
            PlaybackProblems.observe("queue-A","123",source)
            val visible=PlaybackProblems.forError("queue-A","123",received)
            assertEquals("unavailable",visible?.reason);assertEquals("这首歌暂时无法播放",visible?.message)
            assertNull(PlaybackProblems.forError("queue-B","123",received))
            assertNull(PlaybackProblems.forError("queue-A","456",received))
            val newer=PlaybackException.fromBundle(source.toBundle().apply {
                // Timestamp is public and stable across a real Bundle round trip.
                keySet().first { get(it) is Long&&getLong(it)==source.timestampMs }.let { putLong(it,source.timestampMs+1) }
            })
            assertNull(PlaybackProblems.forError("queue-A","123",newer))
            PlaybackProblems.observe("queue-A","123",null)
            assertNull(PlaybackProblems.forError("queue-A","123",received))
        } finally { PlaybackProblems.clear() }
    }

    @Test fun playerFailureCanRecoverWithoutLeakingThePreviousRecoveryAction() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val fail=AtomicBoolean(true);val player=AtomicReference<ExoPlayer>();val original=AtomicReference<PlaybackException>()
        val silence=instrumentation.context.assets.open("offline-silence.wav").use { it.readBytes() }
        val factory=DataSource.Factory {
            if(!fail.get())ByteArrayDataSource(silence) else object: BaseDataSource(false) {
                override fun open(spec: DataSpec): Long = throw MusicProblem("auth","登录已过期，请重新连接")
                override fun read(buffer: ByteArray,offset: Int,length: Int)=C.RESULT_END_OF_INPUT
                override fun getUri()=Uri.parse("synthetic://playback-test")
                override fun close(){}
            }
        }
        try {
            instrumentation.runOnMainSync {
                player.set(ExoPlayer.Builder(instrumentation.targetContext).setMediaSourceFactory(DefaultMediaSourceFactory(factory)).build().apply {
                    volume=0f
                    addListener(object: Player.Listener {
                        override fun onEvents(p: Player,events: Player.Events) {
                            PlaybackProblems.observe(p.currentMediaItem?.mediaMetadata?.extras?.getString("queueSession")?:"",p.currentMediaItem?.mediaId?:"",p.playerError)
                            p.playerError?.let { original.set(it) }
                        }
                    })
                    setMediaItem(MediaItem.Builder().setMediaId("123").setUri("synthetic://playback-test").setMimeType(MimeTypes.AUDIO_WAV)
                        .setMediaMetadata(MediaMetadata.Builder().setExtras(Bundle().apply { putString("queueSession","synthetic-queue") }).build()).build())
                    prepare()
                })
            }
            val end=SystemClock.elapsedRealtime()+15000
            while(original.get()==null&&SystemClock.elapsedRealtime()<end)Thread.sleep(50)
            assertNotNull("Player must report the injected source failure",original.get())
            val received=PlaybackException.fromBundle(original.get().toBundle())
            assertEquals("auth",PlaybackProblems.forError("synthetic-queue","123",received)?.reason)
            fail.set(false);instrumentation.runOnMainSync { player.get().prepare() }
            val ready=AtomicBoolean(false);val recoveryEnd=SystemClock.elapsedRealtime()+10000
            while(!ready.get()&&SystemClock.elapsedRealtime()<recoveryEnd){
                instrumentation.runOnMainSync { ready.set(player.get().playbackState==Player.STATE_READY&&player.get().playerError==null) };Thread.sleep(50)
            }
            assertTrue("Player must become ready after a successful retry",ready.get())
            assertNull(PlaybackProblems.forError("synthetic-queue","123",received))
        } finally { instrumentation.runOnMainSync { player.get()?.release() };PlaybackProblems.clear() }
    }
}
