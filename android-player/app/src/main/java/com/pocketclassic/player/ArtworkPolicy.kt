package com.pocketclassic.player

import java.net.URI

object ArtworkPolicy {
    fun url(raw: String): String? = runCatching {
        require(raw.length <= 2048)
        val uri = URI(raw)
        require(uri.scheme in setOf("http", "https") && uri.host?.matches(Regex("p[1-9]\\.music\\.126\\.net")) == true)
        require(uri.rawUserInfo == null && uri.port == -1 && !uri.rawPath.isNullOrBlank())
        val query = uri.rawQuery.orEmpty().split('&').filter { it.isNotBlank() && it.substringBefore('=') != "param" }.plus("param=320y320").joinToString("&")
        "https://${uri.host}${uri.rawPath}?$query"
    }.getOrNull()
}
