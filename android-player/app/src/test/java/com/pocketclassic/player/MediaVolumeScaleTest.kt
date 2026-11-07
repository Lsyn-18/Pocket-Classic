package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class MediaVolumeScaleTest {
    @Test fun phoneVolumeUsesItsRealDiscreteRange() {
        val scale = MediaVolumeScale(0,15)
        assertEquals(1.0/3,scale.level(5),.000001)
        assertEquals(11,scale.index(.73)); assertEquals(1.0/15,scale.step,.000001)
        val offset = MediaVolumeScale(2,10)
        assertEquals(0.0,offset.level(2),0.0);assertEquals(1.0,offset.level(10),0.0);assertEquals(6,offset.index(.5))
    }
    @Test fun slowWheelStepsMoveEvenOnCoarseVolumeRanges() {
        for(max in listOf(7,15,25,100,150)) {
            val scale=MediaVolumeScale(0,max);val step=maxOf(.04,scale.step)
            assertTrue(scale.index(scale.level(0)+step)>0)
            assertTrue(scale.index(scale.level(max)-step)<max)
        }
    }
    @Test fun outOfRangeLevelsClampAndNonFiniteLevelsAreRejected() {
        val scale=MediaVolumeScale(0,15)
        assertEquals(0,scale.index(-1.0));assertEquals(15,scale.index(2.0))
        assertEquals(0.0,scale.level(-5),0.0);assertEquals(1.0,scale.level(20),0.0)
        for(value in listOf(Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY))assertThrows(IllegalArgumentException::class.java){scale.index(value)}
    }
    @Test fun fixedRangesNeverDivideByZero() {
        val scale=MediaVolumeScale(0,0)
        assertEquals(0.0,scale.level(0),0.0);assertEquals(0.0,scale.step,0.0);assertEquals(0,scale.index(.5))
    }
}
