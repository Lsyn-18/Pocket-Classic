package com.pocketclassic.player

// NetEase marks its own liked playlist with specialType=5; names can be renamed.
fun isOwnLikedPlaylist(specialType: Int, owner: Long, userId: Long) = specialType == 5 && (owner == 0L || owner == userId)
