package com.pocketclassic.player

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.PI

data class MotionAngles(val beta: Double, val gamma: Double)

// Android's rotation matrix maps device axes to world axes. Extract Z-X-Y
// angles matching DeviceOrientation, without using the compass/yaw angle.
fun motionAngles(matrix: FloatArray): MotionAngles {
    require(matrix.size == 9)
    var beta = asin(matrix[7].toDouble().coerceIn(-1.0, 1.0)) * 180 / PI
    var gamma = atan2(-matrix[6].toDouble(), matrix[8].toDouble()) * 180 / PI
    if (gamma > 90 || gamma < -90) {
        beta = if (beta >= 0) 180 - beta else -180 - beta
        gamma += if (gamma > 0) -180 else 180
    }
    return MotionAngles(beta, gamma)
}
