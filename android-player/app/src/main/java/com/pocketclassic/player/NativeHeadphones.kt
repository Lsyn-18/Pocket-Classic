package com.pocketclassic.player

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

/** Observes connected audio outputs; never selects a route or changes playback. */
class NativeHeadphones(context: Context, private val changed: (JSONObject) -> Unit) {
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())
    private var registered = false
    private var previous = ""
    private val publish = Runnable { publish(false) }
    private val callback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(devices: Array<out AudioDeviceInfo>) = schedule()
        override fun onAudioDevicesRemoved(devices: Array<out AudioDeviceInfo>) = schedule()
    }
    private fun schedule() { if (!registered) return; handler.removeCallbacks(publish); handler.postDelayed(publish,140) }
    fun read(): JSONObject = try {
        val types = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { it.isSink }.map { it.type }
        val kind = HeadphoneRoutePolicy.kind(types)
        JSONObject().put("available",true).put("connected",kind != "none").put("kind",kind)
    } catch (_: SecurityException) { JSONObject().put("available",false).put("connected",false).put("kind","none") }
    private fun publish(force: Boolean) {
        val value = read(); val key = value.toString()
        if (force || key != previous) { previous = key; changed(value) }
    }
    fun start() {
        if (!registered) { audio.registerAudioDeviceCallback(callback,handler); registered = true }
        publish(true)
    }
    fun stop() {
        handler.removeCallbacks(publish)
        if (registered) { audio.unregisterAudioDeviceCallback(callback); registered = false }
    }
}
