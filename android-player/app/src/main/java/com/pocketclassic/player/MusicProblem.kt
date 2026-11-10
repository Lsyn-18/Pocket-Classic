package com.pocketclassic.player

import java.io.FileNotFoundException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class MusicProblem(val reason: String,message: String,cause: Throwable?=null): IOException(message,cause)

/** Inspect wrapped Media3 errors too; never return provider URIs or file paths. */
fun problemReason(error: Throwable?): String {
    val causes=generateSequence(error) { it.cause }.take(12).toList()
    return causes.filterIsInstance<MusicProblem>().firstOrNull()?.reason ?: when {
        causes.any { it is SecurityException || it is FileNotFoundException } -> "local-access"
        causes.any { it is UnknownHostException || it is ConnectException || it is SocketTimeoutException } -> "network"
        else -> "unknown"
    }
}

fun problemMessage(error: Throwable?): String = when(problemReason(error)) {
    "local-access" -> "无法读取本地音乐，请重新导入文件或恢复读取权限"
    "network" -> "网络暂不可用，请检查连接后重试，也可播放本地音乐"
    else -> generateSequence(error) { it.cause }.take(12).filterIsInstance<MusicProblem>().firstOrNull()?.message
        ?: error?.message?.take(160) ?: "暂时无法完成，请重试"
}.replace(Regex("(?:content|file|https?)://\\S+|/(?:data|storage|sdcard)/\\S+"),"[地址已省略]").take(160)
