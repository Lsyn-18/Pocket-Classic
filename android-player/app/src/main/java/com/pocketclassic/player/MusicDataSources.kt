package com.pocketclassic.player

import android.content.Context
import android.net.Uri
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import java.io.IOException

@UnstableApi
fun musicDataSources(context: Context, local: LocalMusicLibrary, cloud: (Long) -> String,
    network: DataSource.Factory = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)): DataSource.Factory =
    ResolvingDataSource.Factory(DefaultDataSource.Factory(context, network)) { spec ->
        if (spec.uri.scheme != "pocketclassic") throw IOException("不支持此音频来源")
        val id = spec.uri.lastPathSegment?.toLongOrNull() ?: throw IOException("无效歌曲")
        when (spec.uri.host) {
            "local" -> { require(id < 0); spec.withUri(local.playbackUri(id)) }
            "track" -> { require(id > 0); spec.withUri(Uri.parse(cloud(id))) }
            else -> throw IOException("不支持的音乐来源")
        }
    }
