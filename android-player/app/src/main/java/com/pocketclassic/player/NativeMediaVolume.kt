package com.pocketclassic.player

import android.content.Context
import android.media.AudioManager
import android.os.Build
import kotlin.math.roundToInt

/** Converts the system's discrete media-volume range to the UI's 0..1 scale. */
data class MediaVolumeScale(val minimum: Int, val maximum: Int) {
    init { require(minimum >= 0 && maximum >= minimum) }
    val step: Double get() = if (maximum > minimum) 1.0 / (maximum - minimum) else 0.0
    fun level(index: Int): Double = if (maximum > minimum)
        (index.coerceIn(minimum, maximum) - minimum).toDouble() / (maximum - minimum) else 0.0
    fun index(level: Double): Int {
        require(level.isFinite()) { "无效音量" }
        return (minimum + level.coerceIn(0.0, 1.0) * (maximum - minimum)).roundToInt()
    }
}

class NativeMediaVolume(context: Context) {
    data class State(val level: Double, val step: Double)
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private fun scale(): MediaVolumeScale {
        val maximum = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(0)
        val minimum = if (Build.VERSION.SDK_INT >= 28) audio.getStreamMinVolume(AudioManager.STREAM_MUSIC) else 0
        return MediaVolumeScale(minimum.coerceIn(0, maximum), maximum)
    }
    fun read(): State {
        val range = scale()
        return State(range.level(audio.getStreamVolume(AudioManager.STREAM_MUSIC)), range.step)
    }
    fun set(level: Double): State {
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, scale().index(level), 0)
        return read()
    }
    fun adjust(direction: Int) {
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,direction,AudioManager.FLAG_SHOW_UI)
    }
}
