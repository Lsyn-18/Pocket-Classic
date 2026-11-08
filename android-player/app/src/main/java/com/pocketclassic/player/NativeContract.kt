package com.pocketclassic.player

object NativeContract {
    const val ORIGIN = "https://appassets.androidplatform.net"
    const val PLAYER_PATH = "/assets/player.html"
    const val NEXT = "pocketclassic.next"
    val methods = setOf("ready", "api", "connection", "queue", "play", "pause", "next", "previous", "seek", "volume", "configure", "preferences", "posterReady", "motionAvailable", "motion", "haptic", "artwork", "finish", "localScan", "localImport", "localFolder")
    fun validPosterVersion(value: String) = Regex("[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}").matches(value)
    fun allowedApi(route: String) = route in setOf("status", "playlists", "daily", "roam", "local") || Regex("liked\\?offset=(0|[1-9][0-9]{0,4})").matches(route) || Regex("tracks\\?id=[1-9][0-9]{0,15}(&offset=(0|[1-9][0-9]{0,4}))?").matches(route) || Regex("artists\\?offset=(0|[1-9][0-9]{0,4})").matches(route) || Regex("artist-tracks\\?id=[1-9][0-9]{0,15}&offset=(0|[1-9][0-9]{0,4})").matches(route)
    fun trustedAsset(scheme: String?, host: String?, path: String?) = scheme == "https" && host == "appassets.androidplatform.net" && path == PLAYER_PATH
    fun validMode(mode: String) = mode in setOf("playlist", "daily", "roam", "artist", "liked", "local")
}

class RadioContinuation {
    data class Ticket(val generation: Long, val session: String)
    private var generation = 0L
    private var session = ""
    private var inFlight = false
    private val recent = linkedSetOf<Long>()
    fun switchSession(value: String): Boolean {
        if (session == value) return false
        session = value; generation++; inFlight = false; recent.clear(); return true
    }
    fun begin(existing: List<Long>): Ticket? {
        if (session.isBlank() || inFlight) return null
        inFlight = true; recent.addAll(existing); trim(); return Ticket(generation, session)
    }
    fun current(ticket: Ticket) = ticket.generation == generation && ticket.session == session
    fun accept(ticket: Ticket, tracks: List<MusicTrack>): List<MusicTrack> {
        if (!current(ticket)) return emptyList()
        val fresh = tracks.filter { it.id > 0 && recent.add(it.id) }; trim(); return fresh
    }
    fun finish(ticket: Ticket) { if (current(ticket)) inFlight = false }
    private fun trim() { while (recent.size > 256) recent.remove(recent.first()) }
}
