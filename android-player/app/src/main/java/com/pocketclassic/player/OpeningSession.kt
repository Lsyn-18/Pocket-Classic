package com.pocketclassic.player

/** One opening per explicit app entry, retained across WebView recreation. */
class OpeningSession {
    private var claimed = false

    fun claim(): Boolean = (!claimed).also { claimed = true }

    fun onNewIntent(action: String?, categories: Set<String>?): Boolean {
        if (action != "android.intent.action.MAIN" || categories?.contains("android.intent.category.LAUNCHER") != true) return false
        claimed = false
        return true
    }
}
