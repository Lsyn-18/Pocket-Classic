package com.pocketclassic.player

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class NativeHaptics(context: Context) {
    @Suppress("DEPRECATION")
    private val motor = if (Build.VERSION.SDK_INT >= 31) context.getSystemService(VibratorManager::class.java).defaultVibrator else context.getSystemService(Vibrator::class.java)
    private var lastTick = -1000L
    fun tick() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastTick < 60 || !motor.hasVibrator()) return
        lastTick = now
        val effect = if (Build.VERSION.SDK_INT >= 30 && motor.areEffectsSupported(VibrationEffect.EFFECT_TICK).firstOrNull() == Vibrator.VIBRATION_EFFECT_SUPPORT_YES)
            VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
        else VibrationEffect.createOneShot(8, 60)
        motor.vibrate(effect)
    }
}
