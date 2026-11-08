package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class PlaylistTrackIndexTest {
    private data class Track(val id: Long)
    private fun index(ids: List<Long>?, tracks: List<Long>) = PlaylistTrackIndex(ids,tracks.map(::Track)) { it.id }

    @Test fun savedOrderWinsOverShuffledAndOmittedMetadata() {
        val index=index(listOf(31,17,9,6),listOf(17,31))
        val page=index.page(0) { assertEquals(listOf(9L,6L),it);listOf(Track(6),Track(999),Track(9)) }
        assertEquals(listOf(31L,17L,9L,6L),page.tracks.map { it.id });assertEquals(4,page.trackCount);assertFalse(page.more)
        assertEquals(page,index.page(0) { fail("Metadata should be reused");emptyList() })
    }
    @Test fun pagesUseOneSavedSequenceEvenWhenDetailsComeBackInReverseOrder() {
        val ids=(2005L downTo 1L).toList();val index=index(ids,emptyList())
        val first=index.page(0) { it.reversed().map(::Track) };val second=index.page(first.nextOffset) { it.reversed().map(::Track) };val last=index.page(second.nextOffset) { it.reversed().map(::Track) }
        assertEquals(ids,(first.tracks+second.tracks+last.tracks).map { it.id });assertEquals(1000,first.nextOffset);assertTrue(first.more);assertEquals(2005,last.nextOffset);assertFalse(last.more)
    }
    @Test fun unavailableSongsDoNotChangeOffsetsOrAppendUnexpectedSongs() {
        val index=index(listOf(3,0,-1,2,3,1),emptyList());val page=index.page(0) { listOf(Track(1),Track(999),Track(3)) }
        assertEquals(listOf(3L,1L),page.tracks.map { it.id });assertEquals(3,page.nextOffset);assertEquals(3,page.trackCount);assertFalse(page.more)
    }
    @Test fun absentIdsFallBackToMetadataButAnExplicitEmptyPlaylistStaysEmpty() {
        assertEquals(listOf(9L,3L),index(null,listOf(9,3,9)).page(0) { emptyList() }.tracks.map { it.id })
        assertTrue(index(emptyList(),listOf(9,3)).page(0) { fail("Empty playlist must not fetch");emptyList() }.tracks.isEmpty())
    }
    @Test fun failedLoadsCanRetryAndInvalidOffsetsNeverFetch() {
        val index=index(listOf(3,2,1),emptyList())
        assertThrows(IllegalStateException::class.java) { index.page(0) { error("offline") } }
        assertEquals(listOf(3L,2L,1L),index.page(0) { it.map(::Track) }.tracks.map { it.id })
        for(offset in listOf(-1,100_000))assertThrows(IllegalArgumentException::class.java) { index.page(offset) { fail("Invalid offset must not fetch");emptyList() } }
    }
}
