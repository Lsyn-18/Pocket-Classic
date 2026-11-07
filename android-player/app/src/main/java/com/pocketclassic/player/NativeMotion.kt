package com.pocketclassic.player

import android.app.Activity
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import org.json.JSONObject
import org.json.JSONArray

class NativeMotion(private val activity: Activity, private val emit: (JSONObject) -> Unit) : SensorEventListener {
    private val manager = activity.getSystemService(SensorManager::class.java)
    private val sensor = manager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR) ?: manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val matrix = FloatArray(9)
    private val quaternion = FloatArray(4)
    private var enabled = false
    private var foreground = false
    private var registered = false
    private var lastSample = 0L
    val available get() = sensor != null
    fun enable(value: Boolean) { enabled = value; update() }
    fun foreground(value: Boolean) { foreground = value; update() }
    private fun update() {
        val needed = enabled && foreground && available
        if (needed && !registered) { lastSample = 0; registered = manager.registerListener(this, sensor, 10_000) }
        if (!needed && registered) { manager.unregisterListener(this); registered = false }
    }
    override fun onSensorChanged(event: SensorEvent) {
        if (!enabled || !foreground || event.timestamp - lastSample < 8_000_000L) return
        lastSample = event.timestamp
        SensorManager.getRotationMatrixFromVector(matrix, event.values)
        SensorManager.getQuaternionFromVector(quaternion, event.values)
        val angles = motionAngles(matrix)
        @Suppress("DEPRECATION") val rotation = activity.windowManager.defaultDisplay.rotation
        emit(JSONObject().put("beta", angles.beta).put("gamma", angles.gamma).put("angle", rotation * 90)
            .put("quaternion", JSONArray(listOf(quaternion[1].toDouble(), quaternion[2].toDouble(), quaternion[3].toDouble(), quaternion[0].toDouble()))))
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    fun destroy() { enabled = false; foreground = false; update() }
}
