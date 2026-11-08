package com.pocketclassic.player

// NetEase marks its own liked playlist with specialType=5; names can be renamed.
fun isOwnLikedPlaylist(specialType: Int, owner: Long, userId: Long) = specialType == 5 && (owner == 0L || owner == userId)

fun <T> playlistGroupsInOrder(created: List<T>,collected: List<T>,idOf: (T) -> Long,isLiked: (T) -> Boolean): List<T> {
    val seen=hashSetOf<Long>()
    return (created+collected).filter { idOf(it)>0 && !isLiked(it) && seen.add(idOf(it)) }
}
