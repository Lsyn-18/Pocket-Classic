package com.pocketclassic.player

import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi

data class PlaybackProblem(val reason: String,val message: String)

/** Media3's Bundle drops nested/custom causes. Keep one sanitized native result,
 * matched to the exact queue, item and error timestamp; retain no Throwable/URL.
 * PlaybackService and the UI currently run in this same application process. */
@androidx.annotation.OptIn(UnstableApi::class)
object PlaybackProblems {
    private data class Failure(val session: String,val item: String,val timestamp: Long,val problem: PlaybackProblem)
    @Volatile private var current: Failure? = null

    fun observe(session: String,item: String,error: PlaybackException?) {
        current=if(error==null||session.isBlank()||item.isBlank())null
            else Failure(session,item,error.timestampMs,PlaybackProblem(problemReason(error),problemMessage(error)))
    }
    fun forError(session: String?,item: String?,error: PlaybackException?): PlaybackProblem? {
        val value=current?:return null
        return value.takeIf { error!=null&&it.session==session&&it.item==item&&it.timestamp==error.timestampMs }?.problem
    }
    fun clear(){current=null}
}
