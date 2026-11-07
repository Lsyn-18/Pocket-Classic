package com.pocketclassic.player

import android.annotation.SuppressLint
import android.graphics.Color
import android.media.AudioManager
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.ByteArrayInputStream

@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
class NativePlayerHost(
    private val activity: ComponentActivity, private val vm: PlayerViewModel,
    private val beforePlay: () -> Unit, private val localAction: suspend (String, String) -> JSONObject, private val onError: (String) -> Unit
) {
    private var ready = false
    private var destroyed = false
    private var foreground = false
    private var revision = -1L
    private val motion = NativeMotion(activity) { value -> emit(JSONObject().put("type", "orientation").put("value", value)) }
    private val battery = NativeBattery(activity) { value -> if (ready && foreground) emit(JSONObject().put("type", "battery").put("value", value)) }
    private val haptics = NativeHaptics(activity)
    private val artwork = NativeArtwork()
    val webView: WebView
    init {
        webView = object : WebView(activity) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                val direction = when(event.keyCode) {
                    KeyEvent.KEYCODE_VOLUME_UP -> AudioManager.ADJUST_RAISE
                    KeyEvent.KEYCODE_VOLUME_DOWN -> AudioManager.ADJUST_LOWER
                    else -> return super.dispatchKeyEvent(event)
                }
                // Consume both edges before web content handles these keys.
                if(event.action == KeyEvent.ACTION_DOWN) {
                    vm.adjustMediaVolume(direction); playback()
                }
                return true
            }
        }.apply {
            setBackgroundColor(Color.rgb(247,249,252)); overScrollMode = View.OVER_SCROLL_NEVER
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = false
            settings.allowFileAccess = false; settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false); settings.textZoom = 100
            settings.mediaPlaybackRequiresUserGesture = true
            settings.safeBrowsingEnabled = true
            addJavascriptInterface(object { @JavascriptInterface fun postMessage(raw: String) { handle(raw) } }, "PocketNative")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = true
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                    val uri = request.url
                    if (request.method == "GET" && NativeContract.trustedAsset(uri.scheme, uri.host, uri.path) && uri.query == null) {
                        return WebResourceResponse("text/html", "UTF-8", 200, "OK", mapOf("Cache-Control" to "no-store"), activity.assets.open("player.html"))
                    }
                    return WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", emptyMap(), ByteArrayInputStream(ByteArray(0)))
                }
                override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                    ready = false; destroyed = true; motion.destroy(); battery.stop()
                    (view.parent as? ViewGroup)?.removeView(view); view.destroy()
                    onError("系统释放了播放器界面，请重新打开应用。音乐仍由后台服务管理。"); return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                    if (message.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR &&
                        (message.message().contains("WebGL") || message.message().contains("SyntaxError")))
                        onError("三维界面未能加载，请更新 Android System WebView 后重新打开应用。")
                    return true
                }
            }
            var loaded = false
            addOnLayoutChangeListener { _, left, top, right, bottom, _, _, _, _ ->
                if (!loaded && right > left && bottom > top) {
                    loaded = true; requestFocus(); loadUrl(NativeContract.ORIGIN + NativeContract.PLAYER_PATH)
                }
            }
        }
    }
    private fun handle(raw: String) {
        if (raw.length > 2_000_000) return
        activity.lifecycleScope.launch {
            if (destroyed || webView.url != NativeContract.ORIGIN + NativeContract.PLAYER_PATH) return@launch
            var id = 0
            try {
                val message = JSONObject(raw); id = message.getInt("id"); require(id > 0)
                val method = message.getString("method"); require(method in NativeContract.methods)
                val args = message.optJSONObject("args") ?: JSONObject()
                val result: Any = when (method) {
                    "ready" -> { ready = true; revision = vm.queueRevision; vm.snapshot(true).put("battery", battery.read()).put("opening", vm.claimOpening()) }
                    "api" -> vm.browserApi(args.getString("route"))
                    "connection" -> { vm.showConnection(); JSONObject() }
                    "localScan", "localImport", "localFolder" -> localAction(method, args.optString("category", "device"))
                    "queue" -> { beforePlay(); vm.startQueue(args); revision = vm.queueRevision; vm.snapshot(true) }
                    "volume" -> vm.setMediaVolume(args.getDouble("value"))
                    "play", "pause", "next", "previous", "seek", "configure" -> {
                        if (method == "play") beforePlay()
                        vm.command(method, args); JSONObject()
                    }
                    "preferences" -> { vm.preferences(args); JSONObject() }
                    "motionAvailable" -> JSONObject().put("available", motion.available)
                    "motion" -> { motion.enable(args.optBoolean("enabled")); JSONObject() }
                    "haptic" -> { if (foreground) haptics.tick(); JSONObject() }
                    "artwork" -> JSONObject().put("dataUrl", artwork.load(args.getString("url")))
                    "finish" -> { activity.finish(); JSONObject() }
                    else -> throw IllegalArgumentException("不支持此操作")
                }
                emit(JSONObject().put("type", "response").put("id", id).put("ok", true).put("result", result))
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { emit(JSONObject().put("type", "response").put("id", id).put("ok", false).put("error", e.message?.take(160) ?: "手机操作暂时无法完成")) }
        }
    }
    private fun emit(packet: JSONObject) {
        if (destroyed) return
        webView.evaluateJavascript("window.PocketClassicNative&&window.PocketClassicNative.receive(" + packet.toString() + ");", null)
    }
    fun playback() {
        if (!ready || destroyed || !foreground) return
        val include = revision != vm.queueRevision
        val data = vm.snapshot(include); revision = vm.queueRevision
        emit(JSONObject().put("type", "playback").put("value", data))
    }
    fun connectionChanged() { if (ready) emit(JSONObject().put("type", "connection")) }
    fun back() { if (ready) webView.evaluateJavascript("window.PocketClassicNative&&window.PocketClassicNative.back();", null) else activity.finish() }
    fun resume() {
        if (destroyed) return
        foreground = true; webView.resumeTimers(); webView.onResume()
        emit(JSONObject().put("type", "lifecycle").put("visible", true)); motion.foreground(true); battery.start()
        playback()
    }
    fun pause() {
        foreground = false; motion.foreground(false); battery.stop()
        if (destroyed) return
        val packet = JSONObject().put("type", "lifecycle").put("visible", false)
        webView.evaluateJavascript("window.PocketClassicNative&&window.PocketClassicNative.receive(" + packet.toString() + ");") {
            if (!foreground && !destroyed) { webView.onPause(); webView.pauseTimers() }
        }
    }
    fun destroy() { if (destroyed) return; destroyed = true; motion.destroy(); battery.stop(); webView.removeJavascriptInterface("PocketNative"); webView.destroy() }
}
