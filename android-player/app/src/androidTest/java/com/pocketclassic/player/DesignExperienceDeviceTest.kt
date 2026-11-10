package com.pocketclassic.player

import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Opt-in synthetic visual fixtures. No login, audio, system volume, or library mutation. */
@RunWith(AndroidJUnit4::class)
class DesignExperienceDeviceTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun activity(): MainActivity=listOf(Stage.RESUMED,Stage.STARTED,Stage.CREATED).asSequence().flatMap { ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(it).asSequence() }.filterIsInstance<MainActivity>().first()
    private fun web(view: View): WebView? { if(view is WebView)return view;if(view is ViewGroup)for(i in 0 until view.childCount)web(view.getChildAt(i))?.let { return it };return null }
    private fun js(code: String): String { val result=AtomicReference("null");val done=CountDownLatch(1);instrumentation.runOnMainSync { val surface=runCatching { web(activity().window.decorView) }.getOrNull();if(surface==null)done.countDown() else surface.evaluateJavascript(code) { result.set(it);done.countDown() } };if(!done.await(10,TimeUnit.SECONDS)){capture("00-startup-timeout");instrumentation.runOnMainSync { runCatching { val surface=web(activity().window.decorView)!!;instrumentation.sendStatus(2,android.os.Bundle().apply { putString("stream","\n[Design wait] view=${surface.width}x${surface.height}, content=${surface.contentHeight}, focus=${surface.hasWindowFocus()}, resumed=${activity().lifecycle.currentState}\n") }) } };return "null"};return result.get() }
    private fun ready(condition: String) { val end=SystemClock.elapsedRealtime()+45000;while(SystemClock.elapsedRealtime()<end){instrumentation.uiAutomation.rootInActiveWindow?.findAccessibilityNodeInfosByText("Got it")?.forEach { node->if(node.isClickable)node.performAction(AccessibilityNodeInfo.ACTION_CLICK) };try {if(js(condition)=="true")return}catch(_:NoSuchElementException){};Thread.sleep(150)};status("wait failed");capture("99-failed");fail("Not ready: $condition") }
    private fun status(label: String) { val state=js("JSON.stringify({body:document.body.className,viewport:document.getElementById('modelViewport').dataset,page:PocketClassicContext.state.page,selected:PocketClassicContext.state.selected,back:String(PocketClassicNative.back),sameNative:PocketClassicContext.native===PocketClassicNative,hidden:document.hidden})");instrumentation.sendStatus(2,android.os.Bundle().apply { putString("stream","\n[Design $label] $state\n") }) }
    private fun frames() { val frame=js("Number(document.getElementById('modelViewport').dataset.frames||0)").toIntOrNull()?:0;ready("Number(document.getElementById('modelViewport').dataset.frames)>${frame+1}") }
    private fun capture(name: String) { Thread.sleep(350);val directory=File(instrumentation.targetContext.getExternalFilesDir(null),"design-verification").apply { mkdirs() };instrumentation.uiAutomation.takeScreenshot().also { bitmap->File(directory,"$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) };bitmap.recycle() } }
    @Test fun syntheticScreensSearchShowcaseAndContextLoss() {
        assumeTrue("Explicit isolated design verification required",InstrumentationRegistry.getArguments().getString("designVerification")=="true")
        instrumentation.uiAutomation.executeShellCommand("am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10000000 -n com.pocketclassic.player/.MainActivity").use { descriptor->FileInputStream(descriptor.fileDescriptor).use { it.readBytes() } }
        ready("!!window.PocketClassicContext&&document.body.classList.contains('three-ready')&&!document.body.classList.contains('startup-playing')")
        assertEquals("3D must initialize for this verification","false",js("document.body.classList.contains('three-fallback')"))
        frames();capture("00-layout");
        js("PocketClassicContext.native.ready.then(value=>window.__designFont=value.fontScale)")
        instrumentation.runOnMainSync { val surface=web(activity().window.decorView)!!;instrumentation.sendStatus(2,android.os.Bundle().apply { putString("stream","\n[Design font] native=${activity().resources.configuration.fontScale}, web=${surface.resources.configuration.fontScale}, zoom=${surface.settings.textZoom}\n") }) }
        instrumentation.sendStatus(2,android.os.Bundle().apply { putString("stream","\n[Design layout] "+js("JSON.stringify({bridgeFont:window.__designFont,large:PocketClassicContext.state.systemLargeText,body:document.body.className,width:innerWidth,height:innerHeight,media:matchMedia('(max-width:520px) and (orientation:portrait)').matches,display:getComputedStyle(document.getElementById('playerTools')).display,rules:Array.from(document.styleSheets[0].cssRules).slice(-2).map(rule=>rule.cssText),buttons:['account','localShortcut','openList','playerOptionsToggle'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {id,left:r.left,right:r.right,hidden:document.getElementById(id).hidden};})})")+"\n") })
        assertEquals("Toolbar actions must fit the window","true",js("['account','localShortcut','openList','playerOptionsToggle'].every(id=>{const el=document.getElementById(id);if(el.hidden)return true;const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;})"))
        if(InstrumentationRegistry.getArguments().getString("fallbackOnly")=="true"){
            js("PocketClassicPresentation.fallback()");ready("document.body.classList.contains('three-fallback')");capture("08-fallback-font");
            assertEquals("Fallback footer must fit the enlarged text","true",js("(()=>{const el=document.getElementById('lcdFooter');return el.scrollHeight<=el.clientHeight+1})()"));
            instrumentation.runOnMainSync { activity().finish() };return
        }
        if(InstrumentationRegistry.getArguments().getString("layoutOnly")=="true"){instrumentation.runOnMainSync { activity().finish() };return}
        try {
            js("window.__designPreferences=Object.fromEntries(['dark','theme','largeText','reducedMotion','haptics','quality'].map(key=>[key,PocketClassicContext.state[key]]));window.__designReceive=PocketClassicNative.receive;PocketClassicNative.receive=function(packet){if(packet.type!=='playback')return window.__designReceive(packet);};PocketClassicContext.state.theme='light';PocketClassicContext.render();")
            frames();capture("01-home")
            js("window.__designTracks=Array.from({length:5},(_,i)=>({id:-9001-i,name:'设计验收示例 '+(i+1),artist:'Pocket Classic',album:'本地示例',local:true,sourceKind:'copy',format:'FLAC',durationMs:180000,bytes:1048576}));Object.assign(PocketClassicContext.state,{page:'covers',title:'封面浏览',coverCollection:{tracks:__designTracks,mode:'local',title:'设计验收示例'},selected:2});PocketClassicContext.render();")
            frames();capture("02-covers")
            assertEquals("true",js("PocketClassicVisual.diagnostics().shaderErrors===0&&!PocketClassicVisual.diagnostics().contextLost"))
            js("PocketClassicContext.state.selected=4;PocketClassicContext.render();PocketClassicContext.state.selected=1;PocketClassicContext.render();PocketClassicContext.state.dark=true;PocketClassicContext.state.theme='dark';PocketClassicContext.render();")
            frames();capture("03-covers-dark")
            js("Object.assign(PocketClassicContext.state,{page:'tracks',title:'大曲库示例',tracksSource:'daily',tracks:Array.from({length:5000},(_,i)=>({id:i+1,name:'示例歌曲 '+(i+1),artist:'示例歌手',album:'示例专辑'})),tracksMore:false,selected:0});PocketClassicContext.render();PocketClassicContext.openReader();")
            ready("document.getElementById('readerDialog').open")
            assertEquals("200",js("document.querySelectorAll('[data-reader-index]').length"))
            js("const input=document.getElementById('readerQuery');input.focus();input.value='示例歌曲 4999';input.dispatchEvent(new Event('input',{bubbles:true}));")
            assertEquals("true",js("document.activeElement.id==='readerQuery'&&document.querySelector('[data-reader-index]').dataset.readerIndex==='4998'"));capture("04-search")
            instrumentation.runOnMainSync { activity().requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE }
            ready("innerWidth>innerHeight")
            assertEquals("true",js("(()=>{const r=document.getElementById('readerDialog').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1;})()"));capture("05-search-landscape")
            js("document.getElementById('closeReader').click()")
            ready("!document.getElementById('readerDialog').open")
            instrumentation.runOnMainSync { activity().requestedOrientation=ActivityInfo.SCREEN_ORIENTATION_PORTRAIT }
            ready("innerHeight>innerWidth")
            js("PocketClassicContext.action('menu',true);document.getElementById('openShowcase').click()")
            ready("document.body.classList.contains('showcase-playing')");Thread.sleep(1200);capture("06-showcase")
            ready("!document.body.classList.contains('showcase-playing')");
            assertEquals("true",js("document.getElementById('openShowcase').click();document.body.classList.contains('showcase-playing')"));
            instrumentation.runOnMainSync { activity().onBackPressedDispatcher.onBackPressed() }
            ready("!document.body.classList.contains('showcase-playing')")
            assertEquals("true",js("!document.getElementById('playerTools').inert"))
            js("PocketClassicContext.state.reducedMotion=true;PocketClassicContext.render();document.getElementById('openShowcase').click()")
            assertEquals("false",js("document.body.classList.contains('showcase-playing')"))
            js("PocketClassicContext.state.reducedMotion=false;PocketClassicContext.render();const surface=document.querySelector('#modelViewport>canvas:not(.lcd-surface)');surface.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
            ready("document.body.classList.contains('three-fallback')")
            assertEquals("true",js("getComputedStyle(document.querySelector('.device')).visibility==='visible'&&document.querySelector('.device').getBoundingClientRect().width>200"));capture("07-fallback")
            js("PocketClassicContext.openReader()")
            ready("document.getElementById('readerDialog').open");assertEquals("true",js("document.querySelectorAll('[data-reader-index]').length>0"))
        } finally {
            runCatching { js("if(window.__designPreferences){Object.assign(PocketClassicContext.state,__designPreferences);PocketClassicContext.render();}if(window.__designReceive)PocketClassicNative.receive=window.__designReceive;") }
            instrumentation.runOnMainSync { runCatching { activity().finish() } }
        }
    }
}
