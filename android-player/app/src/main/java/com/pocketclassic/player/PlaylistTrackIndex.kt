package com.pocketclassic.player

data class PlaylistTrackPage<T>(val tracks: List<T>, val trackCount: Int, val nextOffset: Int, val more: Boolean)

/** The saved ID sequence is authoritative; metadata may arrive shuffled or incomplete. */
class PlaylistTrackIndex<T>(order: List<Long>?, tracks: List<T>, private val idOf: (T) -> Long) {
    private val ids = (order ?: tracks.map(idOf)).filter { it > 0 }.distinct().take(100_000)
    private val metadata = tracks.filter { idOf(it) > 0 }.associateBy(idOf).toMutableMap()

    @Synchronized fun page(offset: Int, fetch: (List<Long>) -> List<T>): PlaylistTrackPage<T> {
        require(offset in 0..99_999)
        val page = ids.drop(offset).take(1000)
        val missing = page.filterNot(metadata::containsKey)
        for (batch in missing.chunked(500)) {
            val requested = batch.toHashSet()
            for (track in fetch(batch)) if (idOf(track) in requested) metadata[idOf(track)] = track
        }
        val next = offset + page.size
        return PlaylistTrackPage(page.mapNotNull(metadata::get),ids.size,next,next < ids.size)
    }
}
