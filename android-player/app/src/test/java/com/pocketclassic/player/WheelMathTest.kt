package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.PI

class WheelMathTest {
    @Test fun clockwiseCrossingPiKeepsSmallPositiveDelta() { assertEquals(.10f, normalizedAngleDelta(PI.toFloat() - .05f, -PI.toFloat() + .05f), .0001f) }
    @Test fun counterClockwiseCrossingPiKeepsSmallNegativeDelta() { assertEquals(-.10f, normalizedAngleDelta(-PI.toFloat() + .05f, PI.toFloat() - .05f), .0001f) }
    @Test fun timeFormattingHandlesEmptyAndLongTracks() { assertEquals("0:00", formatTime(-1)); assertEquals("3:13", formatTime(193104)); assertEquals("61:01", formatTime(3661000)) }
}
