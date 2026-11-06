package com.pocketclassic.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import androidx.core.content.ContextCompat
import org.json.JSONObject

class NativeBattery(private val context: Context, private val changed: (JSONObject) -> Unit) {
    private var registered = false
    private val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { changed(value(intent)) }
    }
    private fun value(intent: Intent?): JSONObject {
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        return JSONObject().put("level", if (level >= 0 && scale > 0) (level.toDouble() / scale).coerceIn(0.0, 1.0) else JSONObject.NULL)
            .put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || (status == BatteryManager.BATTERY_STATUS_FULL && (intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0))
    }
    fun read(): JSONObject = value(context.registerReceiver(null, filter))
    fun start() { if (!registered) { ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED); registered = true }; changed(read()) }
    fun stop() { if (registered) { context.unregisterReceiver(receiver); registered = false } }
}
