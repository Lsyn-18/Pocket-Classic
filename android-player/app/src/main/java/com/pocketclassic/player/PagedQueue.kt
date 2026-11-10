package com.pocketclassic.player

data class PagedQueueBatch(val tracks: List<MusicTrack>, val nextOffset: Int, val more: Boolean)
data class PagedQueueSource(val account: String, val title: String, val total: Int, val load: (Int) -> PagedQueueBatch)

/** One cursor per queue. Failed prefetches wait for an explicit retry. */
class QueuePageCursor(offset: Int, hasMore: Boolean) {
    data class Ticket(val serial: Long, val offset: Int)
    var offset = offset; private set
    var more = hasMore; private set
    var loading = false; private set
    var error = ""; private set
    private var serial = 0L
    init { require(offset in 0..100000) }
    @Synchronized fun begin(force: Boolean = false): Ticket? {
        if (!more || loading || error.isNotEmpty() && !force) return null
        loading = true; error = ""; return Ticket(++serial, offset)
    }
    @Synchronized fun accept(ticket: Ticket, nextOffset: Int, hasMore: Boolean, count: Int): Boolean {
        if (ticket.serial != serial || !loading) return false
        require(nextOffset > ticket.offset && nextOffset <= 100000 || !hasMore && nextOffset == ticket.offset) { "歌单分页没有前进，请重新打开歌单" }
        offset = nextOffset; more = hasMore && count < 5000; return true
    }
    @Synchronized fun fail(ticket: Ticket, message: String) { if (ticket.serial == serial) error = message.take(160) }
    @Synchronized fun finish(ticket: Ticket) { if (ticket.serial == serial) loading = false }
}

class PagedQueueContext(val session: String, val source: PagedQueueSource, offset: Int, more: Boolean, var repeat: Int) {
    val cursor = QueuePageCursor(offset, more)
}

/** Native-only reference: no cookies, paths, or loaders cross the WebView. */
object PagedQueues {
    @Volatile private var current: PagedQueueContext? = null
    fun install(value: PagedQueueContext?) { current = value }
    fun forSession(session: String?) = current?.takeIf { it.session == session }
    fun clear(session: String? = null) { if (session == null || current?.session == session) current = null }
}
