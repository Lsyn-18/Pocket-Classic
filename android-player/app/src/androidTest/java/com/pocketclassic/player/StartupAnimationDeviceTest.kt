package com.pocketclassic.player

import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.view.MotionEvent
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

/** Opt-in real-device opening test. Restores motion preferences and orientation;
 * never clears app data, changes system settings or edits the music library. */
@RunWith(AndroidJUnit4::class)
class StartupAnimationDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun step(message: String) = instrumentation.sendStatus(2, Bundle().apply {
        putString("stream", "\n[Startup device] $message\n")
    })
    private fun activity(): MainActivity = listOf(Stage.RESUMED, Stage.STARTED, Stage.PAUSED, Stage.STOPPED, Stage.CREATED)
        .asSequence().flatMap { ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(it).asSequence() }
        .filterIsInstance<MainActivity>().first()
    private fun onActivity(action: (MainActivity) -> Unit) = instrumentation.runOnMainSync { action(activity()) }
    private fun web(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) web(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun js(code: String): String {
        val result = AtomicReference("null"); val done = CountDownLatch(1)
        onActivity { web(it.window.decorView)!!.evaluateJavascript(code) { value -> result.set(value); done.countDown() } }
        check(done.await(10, TimeUnit.SECONDS)) { "WebView did not answer" }; return result.get()
    }
    private fun value(code: String): JSONObject = JSONObject(JSONTokener(js("JSON.stringify($code)")).nextValue() as String)
    private fun ready(condition: String, timeout: Long = 20_000) {
        val end = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < end) {
            try { if (js(condition) == "true") return } catch (_: NoSuchElementException) { }
            Thread.sleep(60)
        }
        runCatching { step("Timeout diagnostics: " + js("JSON.stringify({width:innerWidth,height:innerHeight,vw:visualViewport.width,vh:visualViewport.height,root:[document.documentElement.clientWidth,document.documentElement.clientHeight],classes:document.body.className,opening:document.getElementById('modelViewport')?.dataset.opening,frames:document.getElementById('modelViewport')?.dataset.frames})")) }
        runCatching { onActivity { step("Window: orientation=${it.resources.configuration.orientation}, requested=${it.requestedOrientation}, focused=${it.hasWindowFocus()}") } }
        fail("Not ready: $condition")
    }
    private fun shell(command: String) = instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
        FileInputStream(descriptor.fileDescriptor).use { String(it.readBytes()) }
    }
    private fun launch() {
        shell("am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n com.pocketclassic.player/.MainActivity")
        ready("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')", 45_000)
    }
    private fun relaunch(resetOpeningForAnimationCheck: Boolean = true) {
        lateinit var previous: MainActivity
        onActivity { previous = it; it.finish() }
        val end = SystemClock.elapsedRealtime() + 10_000
        var destroyed = false
        while (!destroyed && SystemClock.elapsedRealtime() < end) {
            instrumentation.runOnMainSync { destroyed = previous.isDestroyed }; Thread.sleep(60)
        }
        assertTrue("Previous activity did not finish", destroyed)
        if (resetOpeningForAnimationCheck) instrumentation.runOnMainSync {
            // UI scenarios need independent opening states within one runner
            // process. This does not substitute for a real process-death test.
            val claimed = OpeningSession::class.java.getDeclaredField("claimed")
            claimed.isAccessible = true; claimed.setBoolean(OpeningSession.process,false)
        }
        launch(); onActivity { assertNotSame("Launcher reused the old activity", previous, it) }
    }
    private fun tap(selector: String) {
        val rect = value("document.querySelector('$selector').getBoundingClientRect().toJSON()")
        val width = js("innerWidth").toDouble()
        val x = rect.getDouble("x") + rect.getDouble("width") / 2
        val y = rect.getDouble("y") + rect.getDouble("height") / 2
        val start = SystemClock.uptimeMillis()
        for (action in listOf(MotionEvent.ACTION_DOWN, MotionEvent.ACTION_UP)) {
            onActivity { activity ->
                val target = web(activity.window.decorView)!!; val scale = target.width / width
                val event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), action, (x * scale).toFloat(), (y * scale).toFloat(), 0)
                target.dispatchTouchEvent(event); event.recycle()
            }
            Thread.sleep(40)
        }
    }
    private fun capture(name: String) {
        // Home contains no account name, library titles, cover art or QR codes.
        assertEquals("\"home\"", js("window.PocketClassicContext.state.page"))
        instrumentation.uiAutomation.takeScreenshot().also { bitmap ->
            File(instrumentation.targetContext.filesDir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            bitmap.recycle()
        }
    }
    private fun usable() {
        assertEquals("true", js("!document.body.classList.contains('startup-playing')&&!document.getElementById('playerTools').inert&&!document.querySelector('.startup-skip,.startup-rings')&&!document.querySelector('#modelViewport>canvas').style.maskImage"))
        val diagnostics = value("window.PocketClassicVisual.diagnostics()")
        assertEquals(0, diagnostics.getInt("shaderErrors")); assertEquals(0, diagnostics.getInt("glError")); assertFalse(diagnostics.getBoolean("contextLost"))
    }
    @Test fun openingTimingTouchSkipLifecycleAndReducedMotion() {
        assumeTrue("Explicit physical-device testing required", InstrumentationRegistry.getArguments().getString("physicalDevice") == "true")
        val store = MusicSessionStore(instrumentation.targetContext)
        val originalReduced = store.reducedMotion
        var originalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        store.reducedMotion = false
        try {
            launch(); relaunch(); onActivity { originalOrientation = it.requestedOrientation }
            assertEquals("false", js("matchMedia('(prefers-reduced-motion: reduce)').matches"))
            ready("document.body.classList.contains('startup-playing')")
            js("""
                window.PocketClassicContext.action('menu',true);
                window.openingProbe={frames:[],phaseFrames:[],phases:{},wheel:[],hold:[],start:performance.now(),done:false};
                (function sample(){
                  const q=window.openingProbe,h=document.getElementById('modelViewport'),phase=h.dataset.opening,now=performance.now();
                  if(!document.getElementById('loadingPoster'))q.visibleStart??=now;
                  q.frames.push(now);q.phaseFrames.push(phase);(q.phases[phase]??=[]).push(now);
                  const ring=document.querySelector('.startup-rings i');
                  if(phase==='wheel'&&ring)q.wheel.push({diameter:ring.getBoundingClientRect().width,x:ring.getBoundingClientRect().x,y:ring.getBoundingClientRect().y});
                  if(phase==='hold')q.hold.push({tilt:h.dataset.tilt,lcd:document.querySelector('.lcd-surface').style.opacity});
                  if(phase==='complete'){q.done=true;return;}requestAnimationFrame(sample);
                })();
            """.trimIndent())
            ready("window.openingProbe.done")
            val result = value("""
                (()=>{const q=window.openingProbe,dt=q.frames.slice(1).map((v,i)=>v-q.frames[i]),sorted=dt.slice().sort((a,b)=>a-b);
                const span=key=>q.phases[key].at(-1)-q.phases[key][0],range=key=>Math.max(...q.wheel.map(v=>v[key]))-Math.min(...q.wheel.map(v=>v[key]));
                return {phases:Object.keys(q.phases),posterMs:q.visibleStart-q.start,duration:q.frames.at(-1)-q.visibleStart,fps:1000*(q.frames.length-1)/(q.frames.at(-1)-q.frames[0]),
                  p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...dt),over50:dt.filter(v=>v>50).length,longFrames:dt.map((ms,i)=>({ms,phase:q.phaseFrames[i+1]})).filter(v=>v.ms>50),
                  holdMs:span('hold'),wheelDiameterChange:range('diameter'),wheelXChange:range('x'),wheelYChange:range('y'),
                  holdStable:q.hold.every(v=>v.tilt===q.hold[0].tilt&&v.lcd==='1')};})()
            """.trimIndent())
            for (phase in listOf("rings", "wheel", "reveal", "backlight", "hold", "complete")) assertTrue("Missing phase $phase: $result", result.getJSONArray("phases").toString().contains("\"$phase\""))
            assertTrue("Opening skipped elapsed time: $result", result.getDouble("duration") in 4300.0..6000.0)
            assertTrue("Opening stalled: $result", result.getDouble("fps") > 50)
            assertTrue("Long animation stall: $result", result.getDouble("max") < 150)
            assertTrue("Hold too short: $result", result.getDouble("holdMs") >= 700)
            for (key in listOf("wheelDiameterChange", "wheelXChange", "wheelYChange")) assertTrue("Wheel handoff moved: $result", result.getDouble(key) < .2)
            assertTrue(result.getBoolean("holdStable")); usable(); step("Complete opening: $result")
            tap(".model-hit-controls button[aria-label=\"中央选择键\"]")
            ready("window.PocketClassicContext.state.page==='music'")
            tap(".model-hit-controls button[aria-label=\"MENU，长按返回主页\"]")
            ready("window.PocketClassicContext.state.page==='home'")
            step("Real WebView touch: centre and MENU usable immediately after opening")

            val volumeBeforeReentry = js("window.PocketClassicContext.audio.volume")
            js("window.retainedOpeningProbe='old-page'")
            repeat(2) {
                shell("input keyevent KEYCODE_HOME"); Thread.sleep(400); launch()
                assertEquals("\"old-page\"",js("window.retainedOpeningProbe"))
                assertEquals("false",js("document.body.classList.contains('startup-playing')||!!document.getElementById('loadingPoster')"))
            }
            assertEquals(volumeBeforeReentry,js("window.PocketClassicContext.audio.volume"))
            usable(); step("Repeated desktop launcher entries keep the existing player without replay")
            relaunch(false)
            ready("document.getElementById('modelViewport').dataset.opening==='restored'")
            assertEquals("false",js("!!document.getElementById('loadingPoster')"))
            usable(); step("A recreated Activity in the same process also skips both openings")

            relaunch(); js("window.PocketClassicContext.action('menu',true)")
            ready("document.getElementById('modelViewport').dataset.opening==='wheel'"); capture("startup-wheel.png")
            ready("document.getElementById('modelViewport').dataset.opening==='hold'"); capture("startup-lit.png")
            ready("!document.body.classList.contains('startup-playing')")

            relaunch(); ready("document.body.classList.contains('startup-playing')")
            js("window.PocketClassicContext.action('menu',true)")
            tap(".startup-skip")
            ready("document.getElementById('modelViewport').dataset.opening==='skip'")
            usable(); assertEquals("\"home\"", js("window.PocketClassicContext.state.page"))
            step("Physical skip touch consumes the action and restores the player")

            relaunch(); ready("document.body.classList.contains('startup-playing')")
            shell("input keyevent KEYCODE_HOME"); Thread.sleep(400)
            shell("am start -f 0x10000000 -n com.pocketclassic.player/.MainActivity")
            ready("document.getElementById('modelViewport').dataset.opening==='background'")
            usable(); val before = js("Number(document.getElementById('modelViewport').dataset.frames)").toInt()
            Thread.sleep(500); assertTrue(js("Number(document.getElementById('modelViewport').dataset.frames)").toInt() > before)
            step("Ordinary task return ends the opening without replay; rendering resumes")

            relaunch(); ready("document.body.classList.contains('startup-playing')")
            onActivity { it.onBackPressedDispatcher.onBackPressed() }
            ready("document.getElementById('modelViewport').dataset.opening==='skip'")
            usable(); step("Android Back skips the opening while keeping the activity open")

            relaunch(); onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            ready("innerWidth>innerHeight&&document.body.classList.contains('landscape-player')")
            ready("!document.body.classList.contains('startup-playing')")
            usable(); assertEquals("true", js("document.documentElement.scrollWidth===document.documentElement.clientWidth&&document.documentElement.scrollHeight===document.documentElement.clientHeight"))
            js("window.PocketClassicContext.action('menu',true)"); capture("startup-landscape.png")
            onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            ready("innerHeight>innerWidth"); usable(); step("Actual landscape/portrait rotation keeps layout inside the window and input usable")

            store.reducedMotion = true; relaunch()
            ready("document.getElementById('modelViewport').dataset.opening==='reduced-motion'")
            usable(); step("Saved reduced-motion preference bypasses the opening on the physical device")
        } finally {
            store.reducedMotion = originalReduced
            runCatching {
                js("window.PocketClassicContext.state.reducedMotion=$originalReduced;window.PocketClassicContext.render()")
                onActivity { it.requestedOrientation = originalOrientation }
            }
        }
    }
}
