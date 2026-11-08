package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class OpeningSessionTest {
    private val main = "android.intent.action.MAIN"
    private val launcher = setOf("android.intent.category.LAUNCHER")

    @Test fun coldEntryAndRecreatedWebViewClaimTheOpeningOnlyOnce() {
        val session = OpeningSession()
        assertTrue(session.claim())
        assertFalse(session.claim())
    }

    @Test fun repeatedLauncherEntriesRearmTheRetainedPage() {
        val session = OpeningSession()
        assertTrue(session.claim())
        repeat(3) {
            assertTrue(session.onNewIntent(main,launcher))
            assertTrue("A desktop icon tap must start both openings again",session.claim())
            assertFalse("Recreating the same entry must not replay it twice",session.claim())
        }
    }

    @Test fun notificationExternalLinkAndOrdinaryResumeDoNotRearm() {
        val session = OpeningSession()
        assertTrue(session.claim())
        for ((action,categories) in listOf(null to null,main to null,"android.intent.action.VIEW" to launcher)) {
            assertFalse(session.onNewIntent(action,categories))
            assertFalse(session.claim())
        }
    }
}
