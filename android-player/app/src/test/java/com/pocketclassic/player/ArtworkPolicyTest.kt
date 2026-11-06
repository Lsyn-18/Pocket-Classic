package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class ArtworkPolicyTest {
    @Test fun validCoversUseHttpsAndThumbnailSize() {
        assertEquals("https://p1.music.126.net/path/cover.jpg?param=320y320", ArtworkPolicy.url("http://p1.music.126.net/path/cover.jpg"))
        assertEquals("https://p2.music.126.net/a.jpg?token=abc&param=320y320", ArtworkPolicy.url("https://p2.music.126.net/a.jpg?param=100y100&token=abc#ignored"))
    }
    @Test fun onlyPublicNeteaseArtworkIsAccepted() {
        for (url in listOf("https://p1.music.126.net.evil.example/a", "http://127.0.0.1/a", "https://user:password@p1.music.126.net/a", "file:///a", "https://p1.music.126.net:8080/a")) assertNull(ArtworkPolicy.url(url))
    }
}
