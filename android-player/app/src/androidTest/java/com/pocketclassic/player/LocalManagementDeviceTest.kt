package com.pocketclassic.player

import android.content.ContentValues
import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class LocalManagementDeviceTest {
    @Test fun partialImportRemovalUndoAndExpiryPreserveOriginalDocuments() {
        assumeTrue(Build.VERSION.SDK_INT>=29)
        val instrumentation=InstrumentationRegistry.getInstrumentation();val target=instrumentation.targetContext
        val key="local-management-"+UUID.randomUUID();val base=File(target.cacheDir,key).apply { mkdirs() }
        val context=object: ContextWrapper(target) {
            override fun getFilesDir()=File(base,"files").apply { mkdirs() }
            override fun getCacheDir()=File(base,"cache").apply { mkdirs() }
            override fun getSharedPreferences(name: String,mode: Int): SharedPreferences=target.getSharedPreferences("$key-$name",mode)
        }
        val resolver=target.contentResolver;val uris=mutableListOf<Uri>()
        try {
            for((name,mime)in listOf("good.wav" to "audio/wav","broken.mp3" to "audio/mpeg","note.txt" to "text/plain")) {
                val uri=resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME,"$key-$name");put(MediaStore.MediaColumns.MIME_TYPE,mime);put(MediaStore.MediaColumns.RELATIVE_PATH,"Download/PocketClassic-tests") })!!;uris.add(uri)
                resolver.openOutputStream(uri)!!.use { output->if(name=="good.wav")instrumentation.context.assets.open("offline-silence.wav").use { it.copyTo(output) } else output.write("fixture".toByteArray()) }
            }
            val library=LocalMusicLibrary(context);val updates=mutableListOf<Int>()
            val result=library.importFiles(uris,progress={ updates.add(it.getInt("processed")) });val report=result.getJSONObject("report")
            assertEquals(1,report.getInt("added"));assertEquals(1,report.getInt("failed"));assertEquals(1,report.getInt("skipped"));assertEquals(2,report.getJSONArray("failures").length());assertEquals(3,updates.last())
            val entry=result.getJSONArray("tracks").getJSONObject(0);val id=entry.getLong("id");assertEquals("copy",entry.getString("sourceKind"));assertTrue(entry.getLong("bytes")>0)
            val copy=File(library.playbackUri(id).path!!);val removed=library.stageRemoval(setOf(id));assertEquals(0,removed.getJSONArray("tracks").length());assertTrue(copy.exists())
            val restored=LocalMusicLibrary(context).undoRemoval(removed.getString("removalToken"));assertEquals(1,restored.getJSONArray("tracks").length());assertTrue(copy.exists())
            val second=library.stageRemoval(setOf(id));library.purgeExpired(System.currentTimeMillis()+11000);assertFalse(copy.exists());assertEquals(0,library.catalog().getJSONArray("tracks").length())
            assertThrows(Exception::class.java) { library.undoRemoval(second.getString("removalToken")) }
            resolver.openInputStream(uris[0])!!.use { assertTrue(it.read()>=0) }
            assertFalse(result.toString().contains("content:"));assertFalse(result.toString().contains("file:"))
        } finally {
            for(uri in uris)resolver.delete(uri,null,null)
            context.getSharedPreferences("local-music",Context.MODE_PRIVATE).edit().clear().commit()
            check(base.canonicalFile.parentFile==target.cacheDir.canonicalFile);base.deleteRecursively()
        }
    }
}
