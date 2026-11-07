package com.pocketclassic.player

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.FileInputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToInt

/** Checks the real phone media stream without playing audio or changing its
 * library. Restores the original system media volume even after a failure. */
@RunWith(AndroidJUnit4::class)
class VolumeSyncDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun activity(): MainActivity = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).filterIsInstance<MainActivity>().first()
    private fun web(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) web(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun js(code: String): String {
        val value = AtomicReference("null"); val done = CountDownLatch(1)
        instrumentation.runOnMainSync { web(activity().window.decorView)!!.evaluateJavascript(code) { value.set(it); done.countDown() } }
        check(done.await(10, TimeUnit.SECONDS)); return value.get()
    }
    private fun waitFor(condition: String, timeout: Long = 5000) {
        val end = SystemClock.elapsedRealtime() + timeout
        while (SystemClock.elapsedRealtime() < end) {
            try { if (js(condition) == "true") return } catch (_: NoSuchElementException) { }
            Thread.sleep(80)
        }
        fail("Volume condition failed: $condition; UI volume=" + runCatching { js("window.PocketClassicContext.audio.volume") }.getOrDefault("unavailable"))
    }
    private fun shell(command: String) = instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
        FileInputStream(descriptor.fileDescriptor).use { String(it.readBytes()) }
    }
    private fun launch() {
        shell("am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n com.pocketclassic.player/.MainActivity")
        waitFor("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')",45000)
        waitFor("!document.body.classList.contains('startup-playing')",10000)
    }
    private fun step(text: String) = instrumentation.sendStatus(2,Bundle().apply { putString("stream","\n[Volume device] $text\n") })
    @Test fun mediaKeysWheelMuteAndForegroundShareSystemVolume() {
        assumeTrue("Explicit phone testing required", InstrumentationRegistry.getArguments().getString("physicalDevice") == "true")
        val audio = instrumentation.targetContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val stream = AudioManager.STREAM_MUSIC
        val original = audio.getStreamVolume(stream)
        val min = if (Build.VERSION.SDK_INT >= 28) audio.getStreamMinVolume(stream) else 0
        val max = audio.getStreamMaxVolume(stream)
        assumeTrue("An adjustable media stream is required", max > min && !audio.isVolumeFixed)
        fun setSystem(index: Int) {
            audio.setStreamVolume(stream,index,0)
            val deadline=SystemClock.elapsedRealtime()+3000
            while(audio.getStreamVolume(stream)!=index&&SystemClock.elapsedRealtime()<deadline)Thread.sleep(50)
            assertEquals("System volume setup failed",index,audio.getStreamVolume(stream))
        }
        fun level(index: Int) = (index-min).toDouble()/(max-min)
        fun synced() { val expected = level(audio.getStreamVolume(stream)); waitFor("Math.abs(window.PocketClassicContext.audio.volume-$expected)<.001") }
        try {
            val initial = min + (max-min)/3
            setSystem(initial); launch(); synced()
            instrumentation.runOnMainSync { activity().window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
            step("Initial UI equals system media volume (${audio.getStreamVolume(stream)} / $max)")
            instrumentation.runOnMainSync { assertEquals("Hardware keys must control media while paused",stream,activity().volumeControlStream) }
            js("window.PocketClassicContext.audio.volume=.37")
            val expected = (min+.37*(max-min)).roundToInt()
            val end = SystemClock.elapsedRealtime()+5000
            while(audio.getStreamVolume(stream)!=expected&&SystemClock.elapsedRealtime()<end)Thread.sleep(80)
            assertEquals("App volume must change the system stream",expected,audio.getStreamVolume(stream)); synced()
            step("App volume changes the real system stream and reads back its quantized level")

            js("window.PocketClassicContext.state.page='playing';window.PocketClassicContext.state.mode='volume';window.PocketClassicContext.rotate(-1)")
            Thread.sleep(350); assertTrue("Wheel did not reduce system volume",audio.getStreamVolume(stream)<expected); synced()
            step("The actual wheel action updates system media volume")

            val before = audio.getStreamVolume(stream)
            instrumentation.runOnMainSync { assertTrue("Phone app must own key focus",activity().hasWindowFocus()) }
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_VOLUME_DOWN); Thread.sleep(700)
            if(audio.getStreamVolume(stream)==before&&InstrumentationRegistry.getArguments().getString("manualVolumeKey")=="true") {
                step("WAITING_FOR_PHYSICAL_VOLUME_DOWN: press the phone's volume-down button once")
                val deadline=SystemClock.elapsedRealtime()+600000
                while(audio.getStreamVolume(stream)>=before&&SystemClock.elapsedRealtime()<deadline)Thread.sleep(100)
            }
            step("Hardware key: system media $before -> ${audio.getStreamVolume(stream)}; UI="+js("window.PocketClassicContext.audio.volume"))
            assertTrue("Phone key did not change media volume",audio.getStreamVolume(stream)<before); synced()
            step("Phone volume key is reflected in the app without playback")

            setSystem(min); synced(); assertEquals(0.0,js("window.PocketClassicContext.audio.volume").toDouble(),.001)
            js("window.PocketClassicContext.state.page='playing';window.PocketClassicContext.state.mode='volume';window.PocketClassicContext.rotate(1)")
            Thread.sleep(350); assertTrue("A slow wheel step must exit mute",audio.getStreamVolume(stream)>min); synced()
            step("System mute and the first wheel step out of mute stay synchronized")

            shell("input keyevent KEYCODE_HOME"); Thread.sleep(300)
            setSystem(min+(max-min)*2/3); launch(); synced()
            step("Launcher return refreshes volume changed while in the background")
        } finally {
            setSystem(original)
            runCatching { instrumentation.runOnMainSync { activity().window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) } }
            runCatching { js("window.PocketClassicContext.action('menu',true)") }
        }
    }
}
