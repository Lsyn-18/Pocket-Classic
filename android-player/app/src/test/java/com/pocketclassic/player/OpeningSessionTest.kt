package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class OpeningSessionTest {
    @Test fun activitiesAndWebViewsShareTheSameProcessMarker() {
        assertTrue(OpeningSession.process.claim())
        repeat(4) { assertFalse("Returning or recreating an Activity must not replay the opening",OpeningSession.process.claim()) }
    }

    @Test fun aFreshProcessHasANewOpeningAfterThePreviousProcessIsGone() {
        val previousProcess = OpeningSession()
        assertTrue(previousProcess.claim()); assertFalse(previousProcess.claim())
        val freshProcess = OpeningSession()
        assertTrue(freshProcess.claim()); assertFalse(freshProcess.claim())
    }

    @Test fun concurrentPagesCanOnlyClaimOneOpeningInAProcess() {
        val session = OpeningSession(); val pool = Executors.newFixedThreadPool(4)
        try { assertEquals(1,pool.invokeAll(List(8) { Callable { session.claim() } }).count { it.get() }) }
        finally { pool.shutdownNow() }
    }
}
