package com.pocketclassic.player

import android.content.ComponentName
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.SystemClock
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.json.JSONObject
import org.json.JSONTokener
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.io.FileInputStream
import kotlin.math.cos
import kotlin.math.sin

@RunWith(AndroidJUnit4::class)
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class IntegratedPlayerTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private lateinit var scenario: ActivityScenario<MainActivity>
    private fun step(message: String) { instrumentation.sendStatus(2, Bundle().apply { putString("stream", "\n[Android integration] " + message + "\n") }) }
    private fun onActivity(action: (MainActivity) -> Unit) {
        instrumentation.runOnMainSync {
            val monitor=ActivityLifecycleMonitorRegistry.getInstance()
            val activity=listOf(Stage.RESUMED,Stage.STARTED,Stage.CREATED).asSequence().flatMap { monitor.getActivitiesInStage(it).asSequence() }.filterIsInstance<MainActivity>().first()
            action(activity)
        }
    }
    private fun findWeb(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) findWeb(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun js(code: String): String {
        val latch = CountDownLatch(1); val value = AtomicReference("null")
        onActivity { activity -> findWeb(activity.window.decorView)!!.evaluateJavascript(code) { value.set(it); latch.countDown() } }
        check(latch.await(15, TimeUnit.SECONDS)) { "WebView did not answer" }; return value.get()
    }
    private fun waitFor(message: String, seconds: Int = 30, condition: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + seconds * 1000
        while (SystemClock.elapsedRealtime() < until) { if (condition()) return; Thread.sleep(200) }
        fail(message)
    }
    private fun ready(condition: String, seconds: Int = 30) {
        try { waitFor("Condition not reached: " + condition, seconds) { js(condition) == "true" } }
        catch (error: AssertionError) {
            step("Playback diagnostic: " + js("JSON.stringify({page:window.PocketClassicContext?.state.page,count:window.PocketClassicContext?.state.queue.length,index:window.PocketClassicContext?.state.queueIndex,ready:window.PocketClassicContext?.audio.readyState,error:window.PocketClassicContext?.audio.error,footer:window.PocketClassicContext?.footerText()})"));throw error
        }
    }
    private fun rectangle(label: String): JSONObject {
        val expression = "JSON.stringify(document.querySelector('.model-hit-controls button[aria-label=\"" + label + "\"]').getBoundingClientRect().toJSON())"
        return JSONObject(JSONTokener(js(expression)).nextValue() as String)
    }
    private fun touch(points: List<Pair<Double,Double>>) {
        val scale = js("document.documentElement.clientWidth").toDouble(); val view = AtomicReference<WebView>(); val location = IntArray(2)
        onActivity { activity -> view.set(findWeb(activity.window.decorView)!!); view.get().getLocationOnScreen(location) }
        val factor = view.get().width / scale
        val down = SystemClock.uptimeMillis()
        points.forEachIndexed { index, point ->
            val action = if (index == 0) MotionEvent.ACTION_DOWN else MotionEvent.ACTION_MOVE
            val event = MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,(location[0]+point.first*factor).toFloat(),(location[1]+point.second*factor).toFloat(),0)
            instrumentation.sendPointerSync(event); event.recycle(); Thread.sleep(25)
        }
        val point=points.last(); val up=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,(location[0]+point.first*factor).toFloat(),(location[1]+point.second*factor).toFloat(),0)
        instrumentation.sendPointerSync(up);up.recycle()
    }
    private fun tap(label: String) { val r=rectangle(label); touch(listOf(Pair(r.getDouble("x")+r.getDouble("width")/2,r.getDouble("y")+r.getDouble("height")/2))) }
    private fun turnOneStep() {
        val center=rectangle("中央选择键");val right=rectangle("下一曲，长按快进")
        val cx=center.getDouble("x")+center.getDouble("width")/2;val cy=center.getDouble("y")+center.getDouble("height")/2
        val radius=right.getDouble("x")+right.getDouble("width")/2-cx
        touch((0..8).map { val a=it*.44/8;Pair(cx+radius*cos(a),cy+radius*sin(a)) })
    }
    @Test fun packagedInterfacePlaybackAndBackgroundRadio() {
        val context=instrumentation.targetContext; val args=InstrumentationRegistry.getArguments()
        instrumentation.uiAutomation.executeShellCommand("wm dismiss-keyguard").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
        val authenticated=args.getString("authenticated")=="true"
        step("Using the on-device NetEase session, without a desktop gateway")
        step("Launching the packaged player")
        scenario=ActivityScenario.launch(MainActivity::class.java)
        try {
            ready("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')",45)
            ready("Number(document.getElementById('modelViewport').dataset.frames)>=3",45)
            ready("document.getElementById('modelViewport').getBoundingClientRect().height>100")
            waitFor("Player window did not gain focus") { val focused=AtomicReference(false);onActivity { focused.set(it.window.decorView.hasWindowFocus()) };focused.get() }
            step("Local 3D page initialized")
            onActivity { activity ->
                val web=findWeb(activity.window.decorView)!!
                step("Native bounds: " + web.width + "x" + web.height + ", attached=" + web.isAttachedToWindow + ", shown=" + web.isShown + ", focus=" + web.hasWindowFocus())
            }
            step("Page bounds: " + js("JSON.stringify({width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,viewport:document.getElementById('modelViewport').getBoundingClientRect().toJSON(),canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),center:document.querySelector('.model-hit-controls button[aria-label=\"中央选择键\"]').getBoundingClientRect().toJSON()})"))
            instrumentation.uiAutomation.takeScreenshot().also { bitmap -> File(context.filesDir,"pocketclassic-startup.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle() }
            assertEquals("true",js("!!window.PocketClassicContext.native"))
            ready("Number.isFinite(window.PocketClassicContext.state.battery.level)")
            step("System battery available: " + js("JSON.stringify(window.PocketClassicContext.state.battery)"))
            val emulator = android.os.Build.FINGERPRINT.startsWith("generic") || android.os.Build.MODEL.contains("sdk_gphone") || android.os.Build.MODEL.contains("Emulator")
            if (!authenticated && emulator && args.getString("simulateBattery") == "true") {
                try {
                    instrumentation.uiAutomation.executeShellCommand("cmd battery unplug").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
                    instrumentation.uiAutomation.executeShellCommand("cmd battery set level 37").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
                    ready("Math.round(window.PocketClassicContext.state.battery.level*100)===37")
                    instrumentation.uiAutomation.executeShellCommand("cmd battery set level 72").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
                    ready("Math.round(window.PocketClassicContext.state.battery.level*100)===72")
                    step("Live battery changes reached the rendered player")
                } finally { instrumentation.uiAutomation.executeShellCommand("cmd battery reset").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } } }
            }
            assertEquals("true",js("document.documentElement.clientWidth===document.documentElement.scrollWidth&&document.documentElement.clientHeight===document.documentElement.scrollHeight"))
            js("window.PocketClassicContext.action('menu',true)");ready("window.PocketClassicContext.state.page==='home'")
            tap("中央选择键");ready("window.PocketClassicContext.state.page==='music'")
            assertTrue(js("JSON.stringify(window.PocketClassicContext.entries())").contains("每日推荐"))
            assertTrue(js("JSON.stringify(window.PocketClassicContext.entries())").contains("私人漫游"))
            turnOneStep();ready("window.PocketClassicContext.state.selected===1")
            step("Native touch and wheel navigation passed")
            if(!authenticated)return
            ready("window.PocketClassicContext.state.connected")
            repeat(2) { turnOneStep(); Thread.sleep(120) }
            ready("window.PocketClassicContext.entries()[window.PocketClassicContext.state.selected].id==='daily'")
            tap("中央选择键");ready("window.PocketClassicContext.state.page==='tracks'&&!window.PocketClassicContext.state.busy&&window.PocketClassicContext.state.tracks.length>0")
            tap("中央选择键");ready("window.PocketClassicContext.state.queueMode==='daily'&&window.PocketClassicContext.audio.readyState===4&&!window.PocketClassicContext.audio.paused",45)
            step("Daily recommendation decoded by the native player")
            ready("!!window.PocketClassicContext.state.current.cover")
            js("window.PocketClassicContext.native.artwork(window.PocketClassicContext.state.current.cover).then(source=>{const image=new Image();image.onload=()=>window.actualCoverDecoded=image.naturalWidth>0;image.onerror=()=>window.actualCoverDecoded=false;image.src=source}).catch(()=>window.actualCoverDecoded=false)")
            ready("window.actualCoverDecoded===true",30)
            step("Real album artwork downloaded natively and decoded in WebView")
            instrumentation.uiAutomation.takeScreenshot().also { bitmap -> File(context.filesDir,"pocketclassic-android.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle() }
            tap("播放暂停，长按休眠");ready("window.PocketClassicContext.audio.paused")
            tap("MENU，长按返回主页");tap("MENU，长按返回主页");ready("window.PocketClassicContext.state.page==='music'")
            turnOneStep();ready("window.PocketClassicContext.entries()[window.PocketClassicContext.state.selected].id==='roam'")
            tap("中央选择键");ready("window.PocketClassicContext.state.queueMode==='roam'&&window.PocketClassicContext.audio.readyState===4&&!window.PocketClassicContext.audio.paused",45)
            val initialCount=js("window.PocketClassicContext.state.queue.length").toInt()
            tap("下一曲，长按快进");ready("window.PocketClassicContext.state.queueIndex===1")
            ready("window.PocketClassicContext.state.queue.length>"+initialCount,45)
            val filledCount=js("window.PocketClassicContext.state.queue.length").toInt()
            step("Native radio appended fresh tracks: " + initialCount + " to " + filledCount)
            val targetIndex=(filledCount-2).coerceAtLeast(2)

            val future=AtomicReference<com.google.common.util.concurrent.ListenableFuture<MediaController>>()
            instrumentation.runOnMainSync { future.set(MediaController.Builder(context,SessionToken(context,ComponentName(context,PlaybackService::class.java))).buildAsync()) }
            val controller=future.get().get(15,TimeUnit.SECONDS);val oldId=AtomicReference("")
            step("Moving the player to the background")
            instrumentation.uiAutomation.executeShellCommand("input keyevent KEYCODE_HOME").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
            waitFor("Activity did not stop") { val stopped=AtomicReference(false);instrumentation.runOnMainSync { stopped.set(ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.STOPPED).any { it is MainActivity }) };stopped.get() }
            repeat(targetIndex-1) {
                instrumentation.runOnMainSync { oldId.set(controller.currentMediaItem!!.mediaId);controller.seekTo((controller.duration-750).coerceAtLeast(0)) }
                waitFor("Radio did not advance while WebView was stopped",20) { val changed=AtomicReference(false);instrumentation.runOnMainSync { changed.set(controller.currentMediaItem?.mediaId!=oldId.get()&&controller.isPlaying) };changed.get() }
            }
            waitFor("Radio did not refill in the background",45) { val count=AtomicReference(0);instrumentation.runOnMainSync { count.set(controller.mediaItemCount) };count.get()>filledCount }
            step("Native playback advanced and refilled again while the WebView was stopped")
            // Returning via the launcher models a user opening the app. A background
            // context.startActivity is correctly blocked by some HyperOS versions.
            instrumentation.uiAutomation.executeShellCommand("am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n com.pocketclassic.player/.MainActivity").use { descriptor -> FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
            waitFor("Activity did not resume") { val resumed=AtomicReference(false);instrumentation.runOnMainSync { resumed.set(ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).any { it is MainActivity }) };resumed.get() }
            ready("window.PocketClassicContext.state.queueIndex>="+targetIndex+"&&window.PocketClassicContext.audio.readyState===4")
            tap("播放暂停，长按休眠");ready("window.PocketClassicContext.audio.paused")
            instrumentation.runOnMainSync { controller.release() }
            onActivity { it.requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            ready("document.documentElement.clientWidth>document.documentElement.clientHeight&&document.body.classList.contains('landscape-player')&&document.getElementById('modelViewport').getBoundingClientRect().height>100")
            onActivity { it.requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            ready("document.documentElement.clientWidth<document.documentElement.clientHeight&&!document.body.classList.contains('landscape-player')")
            step("Portrait and landscape layouts passed")
            js("document.getElementById('motionToggle').click()")
            ready("['active','unsupported','unavailable'].includes(document.getElementById('modelViewport').dataset.motion)",12)
        } finally { instrumentation.runOnMainSync { ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).filterIsInstance<MainActivity>().forEach { it.finish() } } }
    }
}
