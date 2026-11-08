package com.pocketclassic.player

/** One opening per app process, shared by every Activity and WebView. */
class OpeningSession {
    private var claimed = false

    @Synchronized fun claim(): Boolean = (!claimed).also { claimed = true }

    companion object {
        // Memory only: a genuinely new process naturally receives a new marker.
        val process = OpeningSession()
    }
}
