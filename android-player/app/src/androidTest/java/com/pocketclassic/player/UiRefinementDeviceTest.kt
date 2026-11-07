package com.pocketclassic.player

import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Real window rotation and WebView layout; no system settings or account mutations. */
@RunWith(AndroidJUnit4::class)
class UiRefinementDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun activity(): MainActivity = listOf(Stage.RESUMED, Stage.STARTED, Stage.CREATED)
        .asSequence().flatMap { ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(it).asSequence() }
        .filterIsInstance<MainActivity>().first()
    private fun onActivity(action: (MainActivity) -> Unit) = instrumentation.runOnMainSync { action(activity()) }
    private fun web(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) web(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun js(code: String): String {
        val value = AtomicReference("null"); val done = CountDownLatch(1)
        onActivity { web(it.window.decorView)!!.evaluateJavascript(code) { result -> value.set(result); done.countDown() } }
        check(done.await(10, TimeUnit.SECONDS)) { "WebView did not answer" }
        return value.get()
    }
    private fun ready(condition: String) {
        val deadline = SystemClock.elapsedRealtime() + 30_000
        while (SystemClock.elapsedRealtime() < deadline) {
            try { if (js(condition) == "true") return } catch (_: NoSuchElementException) { }
            Thread.sleep(150)
        }
        fail("Not ready: $condition")
    }
    private fun checkHelp(orientation: String) {
        js("window.PocketClassicContext.openHelp()")
        val metrics = JSONObject(JSONTokener(js("""
            JSON.stringify((()=>{
              const dialog=document.getElementById('helpDialog'),r=dialog.getBoundingClientRect();
              const title=document.getElementById('helpTitle').getBoundingClientRect();
              const close=document.getElementById('dismissHelp').getBoundingClientRect();
              return {height:r.height,maxHeight:getComputedStyle(dialog).maxHeight,scrollTop:dialog.scrollTop,
                inside:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1,
                titleVisible:title.top>=r.top&&title.bottom<=r.bottom,
                closeVisible:close.top>=r.top&&close.bottom<=r.bottom};
            })())
        """.trimIndent())).nextValue() as String)
        instrumentation.sendStatus(2, Bundle().apply { putString("stream", "\n[UI $orientation] $metrics\n") })
        assertTrue("Help collapsed: $metrics", metrics.getDouble("height") > 200)
        assertTrue(metrics.getBoolean("inside")); assertTrue(metrics.getBoolean("titleVisible")); assertTrue(metrics.getBoolean("closeVisible"))
        assertEquals(0.0, metrics.getDouble("scrollTop"), .5)
        // DOM rotation can finish before Android's surface transition. Capture
        // only after the compositor has settled, rather than a mixed old frame.
        Thread.sleep(450)
        instrumentation.uiAutomation.takeScreenshot().also { bitmap ->
            File(instrumentation.targetContext.filesDir, "ui-help-$orientation.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
        js("document.getElementById('dismissHelp').click()")
    }
    @Test fun helpAndFullWindowAcrossRealRotation() {
        assumeTrue("Explicit device testing required", InstrumentationRegistry.getArguments().getString("physicalDevice") == "true")
        // Launch as the shell, matching the launcher intent. Some vendors block
        // startActivity from the instrumented background context.
        instrumentation.uiAutomation.executeShellCommand("am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n com.pocketclassic.player/.MainActivity")
            .use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
        ready("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')")
        ready("!document.body.classList.contains('startup-playing')")
        var original = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        onActivity { original = it.requestedOrientation }
        try {
            onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            ready("innerHeight>innerWidth")
            checkHelp("portrait")
            onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            ready("innerWidth>innerHeight&&document.body.classList.contains('landscape-player')")
            checkHelp("landscape")
            js("document.getElementById('playerOptionsToggle').click()")
            assertEquals("Landscape options extend outside the window", "true", js("(()=>{const r=document.getElementById('playerOptionsPanel').getBoundingClientRect();return r.height>40&&r.top>=0&&r.bottom<=innerHeight+1})()"))
            js("document.getElementById('playerOptionsToggle').click()")
            assertEquals("true", js("document.documentElement.scrollWidth===document.documentElement.clientWidth&&Math.abs(document.getElementById('modelViewport').getBoundingClientRect().height-innerHeight)<1"))
        } finally {
            js("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
            onActivity { it.requestedOrientation = original }
        }
    }
}
