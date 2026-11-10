package com.pocketclassic.player

import org.junit.Assert.*
import org.junit.Test

class PagedQueueTest {
    @Test fun pageRequestsCoalesceAndFailuresRequireExplicitRetry() {
        val cursor=QueuePageCursor(100,true)
        val ticket=cursor.begin()!!;assertNull(cursor.begin())
        cursor.fail(ticket,"网络暂不可用");cursor.finish(ticket)
        assertNull(cursor.begin());assertEquals(100,cursor.offset)
        val retry=cursor.begin(true)!!;assertEquals("",cursor.error)
        assertTrue(cursor.accept(retry,205,false,205));cursor.finish(retry)
        assertFalse(cursor.more);assertFalse(cursor.loading);assertNull(cursor.begin(true))
    }
    @Test fun lateTicketsCannotMutateANewerRequest() {
        val cursor=QueuePageCursor(100,true);val old=cursor.begin()!!;cursor.finish(old)
        val current=cursor.begin()!!;assertFalse(cursor.accept(old,500,false,500));cursor.finish(old)
        assertTrue(cursor.loading);assertTrue(cursor.accept(current,200,true,200));cursor.finish(current)
        assertEquals(200,cursor.offset);assertTrue(cursor.more)
    }
    @Test fun invalidOffsetsCannotLoopForeverAndQueueSizeIsBounded() {
        val cursor=QueuePageCursor(100,true);val ticket=cursor.begin()!!
        assertThrows(IllegalArgumentException::class.java) { cursor.accept(ticket,100,true,100) }
        assertTrue(cursor.accept(ticket,1100,true,5000));cursor.finish(ticket);assertFalse(cursor.more)
    }
    @Test fun nativeSourceCannotBeReusedByAnotherPlaybackSession() {
        val source=PagedQueueSource("account","测试歌单",205) { PagedQueueBatch(emptyList(),205,false) }
        val first=PagedQueueContext("first",source,100,true,2);PagedQueues.install(first)
        assertSame(first,PagedQueues.forSession("first"));assertNull(PagedQueues.forSession("other"))
        val second=PagedQueueContext("second",source,100,true,0);PagedQueues.install(second);PagedQueues.clear("first")
        assertSame(second,PagedQueues.forSession("second"));PagedQueues.clear()
    }
}
