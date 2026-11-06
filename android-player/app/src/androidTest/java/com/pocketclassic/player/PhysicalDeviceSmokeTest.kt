package com.pocketclassic.player

import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.os.BatteryManager
import android.os.Bundle
import android.os.SystemClock
import android.os.VibratorManager
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.cos
import kotlin.math.sin

/** Tests only this app. Never changes system battery, display, lock or permission settings. */
@RunWith(AndroidJUnit4::class)
class PhysicalDeviceSmokeTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private lateinit var scenario: ActivityScenario<MainActivity>
    private fun step(message: String) = instrumentation.sendStatus(2, Bundle().apply { putString("stream", "\n[Physical device] $message\n") })
    private fun web(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) web(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun js(code: String): String {
        val result = AtomicReference("null"); val latch = CountDownLatch(1)
        scenario.onActivity { activity -> web(activity.window.decorView)!!.evaluateJavascript(code) { result.set(it); latch.countDown() } }
        check(latch.await(10, TimeUnit.SECONDS)) { "WebView did not respond" }; return result.get()
    }
    private fun waitFor(condition: String, seconds: Int = 30) {
        val deadline = SystemClock.elapsedRealtime() + seconds * 1000
        while (SystemClock.elapsedRealtime() < deadline) { if (js(condition) == "true") return; Thread.sleep(150) }
        fail("Not ready: $condition")
    }
    private fun rectangle(label: String): JSONObject = JSONObject(JSONTokener(js("JSON.stringify(document.querySelector('.model-hit-controls button[aria-label=\"$label\"]').getBoundingClientRect().toJSON())")).nextValue() as String)
    private fun touch(points: List<Pair<Double, Double>>) {
        val width = js("document.documentElement.clientWidth").toDouble(); val start = SystemClock.uptimeMillis()
        points.forEachIndexed { i, point ->
            scenario.onActivity { activity ->
                val target = web(activity.window.decorView)!!; val scale = target.width / width
                val event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), if (i == 0) MotionEvent.ACTION_DOWN else MotionEvent.ACTION_MOVE, (point.first * scale).toFloat(), (point.second * scale).toFloat(), 0)
                target.dispatchTouchEvent(event); event.recycle()
            }; Thread.sleep(30)
        }
        val last = points.last()
        scenario.onActivity { activity ->
            val target = web(activity.window.decorView)!!; val scale = target.width / width
            val event = MotionEvent.obtain(start, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, (last.first * scale).toFloat(), (last.second * scale).toFloat(), 0)
            target.dispatchTouchEvent(event); event.recycle()
        }
    }
    private fun tap(label: String) { val r = rectangle(label); touch(listOf(Pair(r.getDouble("x") + r.getDouble("width") / 2, r.getDouble("y") + r.getDouble("height") / 2))) }
    @Test fun nativeSensorSamplesAndCalibration() {
        assumeTrue("Explicit sensor check required", InstrumentationRegistry.getArguments().getString("motionTest") == "true")
        scenario = ActivityScenario.launch(MainActivity::class.java)
        try {
            waitFor("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')",45)
            js("window.motionSampleCount=0;window.stopMotionSamples=window.PocketClassicContext.native.motion.subscribe(()=>window.motionSampleCount++);document.getElementById('motionToggle').click()")
            waitFor("window.motionSampleCount>=8&&document.getElementById('modelViewport').dataset.motion==='active'",20)
            step("Native sensor samples received and natural-hold calibration became active")
        } finally {
            js("if(document.getElementById('motionToggle').getAttribute('aria-pressed')==='true')document.getElementById('motionToggle').click();window.stopMotionSamples?.()")
            scenario.close()
        }
    }
    @Test fun renderTouchBatteryMotionAndRotation() {
        assumeTrue("Explicit physical-device run required", InstrumentationRegistry.getArguments().getString("physicalDevice") == "true")
        val context = instrumentation.targetContext
        scenario = ActivityScenario.launch(MainActivity::class.java)
        var originalPreferences: String? = null
        var originalOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        try {
            waitFor("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')", 45)
            js("window.PocketClassicContext.native.ready.then(()=>window.physicalSmokeReady=true)")
            waitFor("window.physicalSmokeReady===true")
            waitFor("Number(document.getElementById('modelViewport').dataset.frames)>10")
            originalPreferences = js("JSON.stringify({dark:window.PocketClassicContext.state.dark,haptics:window.PocketClassicContext.state.haptics})")
            scenario.onActivity { originalOrientation = it.requestedOrientation }
            assertEquals("true", js("document.documentElement.clientWidth===document.documentElement.scrollWidth&&document.documentElement.clientHeight===document.documentElement.scrollHeight"))
            val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))!!
            val expected = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1).toDouble() / battery.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val actual = js("window.PocketClassicContext.state.battery.level").toDouble()
            assertEquals(expected, actual, .011)
            step("Real system battery matches UI: ${(actual * 100).toInt()}%")
            val before = js("Number(document.getElementById('modelViewport').dataset.frames)").toDouble()
            val started = SystemClock.elapsedRealtime(); Thread.sleep(2500)
            val fps = (js("Number(document.getElementById('modelViewport').dataset.frames)").toDouble() - before) * 1000 / (SystemClock.elapsedRealtime() - started)
            step("Foreground render rate: ${"%.1f".format(java.util.Locale.US, fps)} fps")
            assertTrue("Rendering froze", fps > 10)
            js("window.PocketClassicContext.action('menu',true)")
            waitFor("window.PocketClassicContext.state.page==='home'")
            tap("中央选择键"); waitFor("window.PocketClassicContext.state.page==='music'")
            val center = rectangle("中央选择键"); val right = rectangle("下一曲，长按快进")
            val cx = center.getDouble("x") + center.getDouble("width") / 2; val cy = center.getDouble("y") + center.getDouble("height") / 2
            val radius = right.getDouble("x") + right.getDouble("width") / 2 - cx
            touch((0..10).map { val a = it * .44 / 10; Pair(cx + radius * cos(a), cy + radius * sin(a)) })
            waitFor("window.PocketClassicContext.state.selected===1")
            tap("MENU，长按返回主页"); waitFor("window.PocketClassicContext.state.page==='home'")
            step("Native WebView touch, wheel detent and MENU passed")
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                val motor = context.getSystemService(VibratorManager::class.java).defaultVibrator
                step("Phone vibration motor available: ${motor.hasVibrator()}, amplitude control: ${motor.hasAmplitudeControl()}")
            }
            js("window.PocketClassicContext.native.request('haptic').then(()=>window.physicalHapticDone=true)")
            waitFor("window.physicalHapticDone===true")
            js("document.getElementById('motionToggle').click()")
            waitFor("['active','calibrating','unsupported','unavailable'].includes(document.getElementById('modelViewport').dataset.motion)", 15)
            step("Native motion phase: " + js("document.getElementById('modelViewport').dataset.motion"))
            js("if(document.getElementById('motionToggle').getAttribute('aria-pressed')==='true')document.getElementById('motionToggle').click()")
            scenario.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            waitFor("document.documentElement.clientWidth>document.documentElement.clientHeight&&document.body.classList.contains('landscape-player')")
            assertEquals("true", js("document.documentElement.scrollWidth===document.documentElement.clientWidth"))
            scenario.onActivity { it.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            waitFor("document.documentElement.clientWidth<document.documentElement.clientHeight&&!document.body.classList.contains('landscape-player')")
            step("Portrait and landscape passed; account linked: " + js("window.PocketClassicContext.state.connected"))
        } finally {
            originalPreferences?.let { raw -> js("Object.assign(window.PocketClassicContext.state,JSON.parse($raw));window.PocketClassicContext.render()") }
            scenario.onActivity { it.requestedOrientation = originalOrientation }
            scenario.close()
        }
    }
}
