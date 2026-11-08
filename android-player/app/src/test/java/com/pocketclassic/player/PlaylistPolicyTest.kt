package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class PlaylistPolicyTest {
    private data class Row(val id: Long,val name: String="",val liked: Boolean=false)
    private fun merge(a: List<Row>,b: List<Row>)=playlistGroupsInOrder(a,b,{it.id},{it.liked})
    @Test fun mobileGroupsKeepPinnedAndCustomOrderInsteadOfSortingByIdOrTitle() {
        val rows=merge(listOf(Row(8,"Pinned"),Row(9,"Z"),Row(7,liked=true),Row(1,"A")),listOf(Row(8,"Pinned"),Row(3,"Collected")))
        assertEquals(listOf(8L,9L,1L,3L),rows.map { it.id })
    }
    @Test fun emptyGroupsAndDuplicatePinnedItemsDoNotInventOrRepeatRows() {
        assertTrue(merge(emptyList(),emptyList()).isEmpty())
        assertEquals(listOf(5L),merge(emptyList(),listOf(Row(0),Row(-1),Row(5),Row(5))).map { it.id })
    }
    @Test fun likedFilteringUsesTheOwnerAndTypeInsteadOfTheTitle() {
        assertTrue(isOwnLikedPlaylist(5,7,7));assertFalse(isOwnLikedPlaylist(5,8,7));assertFalse(isOwnLikedPlaylist(0,7,7))
    }
}
