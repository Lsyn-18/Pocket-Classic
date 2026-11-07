package com.pocketclassic.player

object MusicQuality {
    val levels = setOf("standard", "exhigh", "lossless", "hires")
    fun valid(value: String) = value in levels
    fun restored(value: String?) = value?.takeIf(::valid) ?: "standard"
}
