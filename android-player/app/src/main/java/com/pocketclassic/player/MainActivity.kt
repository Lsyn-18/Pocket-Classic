package com.pocketclassic.player

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var playerHost: NativePlayerHost
    private var askedNotifications = false
    private fun notificationPermission() {
        if (!askedNotifications && Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askedNotifications = true
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val vm = ViewModelProvider(this)[PlayerViewModel::class.java]
        var error by mutableStateOf("")
        playerHost = NativePlayerHost(this, vm, ::notificationPermission) { error = it }
        onBackPressedDispatcher.addCallback(this) {
            if (vm.state.showConnection) vm.showConnection(false) else playerHost.back()
        }
        setContent {
            val state = vm.state
            MaterialTheme {
                Box(Modifier.fillMaxSize().background(Color(0xFFF7F9FC)).safeDrawingPadding()) {
                    AndroidView(factory = { playerHost.webView }, modifier = Modifier.fillMaxSize())
                }
                if (state.showConnection) {
                    var url by remember { mutableStateOf(state.endpoint) }
                    var code by remember { mutableStateOf("") }
                    AlertDialog(
                        onDismissRequest = { vm.showConnection(false) },
                        title = { Text("连接网易云音乐") },
                        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("电脑与手机连接同一 Wi-Fi。在电脑上扫码登录，再到手机配对页查看服务地址和 6 位配对码。", fontSize = 13.sp, lineHeight = 20.sp)
                            OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("服务地址") },
                                placeholder = { Text("http://192.168.1.10:17864") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), singleLine = true)
                            OutlinedTextField(value = code, onValueChange = { code = it.filter(Char::isDigit).take(6) }, label = { Text("6 位配对码") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
                            if (state.connected) Text("已连接：" + state.nickname, fontSize = 13.sp)
                            if (state.message.isNotBlank()) Text(state.message, color = Color(0xFF995224), fontSize = 12.sp)
                            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                        } },
                        confirmButton = { TextButton(enabled = !state.busy && code.length == 6 && url.isNotBlank(), onClick = { vm.pair(url, code) }) { Text("配对连接") } },
                        dismissButton = { Row {
                            if (state.endpoint.isNotBlank()) TextButton(onClick = { vm.disconnect() }) { Text("断开") }
                            TextButton(onClick = { vm.showConnection(false) }) { Text("完成") }
                        } }
                    )
                }
                if (error.isNotBlank()) AlertDialog(onDismissRequest = { error = "" }, title = { Text("界面加载提示") },
                    text = { Text(error) }, confirmButton = { TextButton(onClick = { finish() }) { Text("关闭后重新打开") } })
                LaunchedEffect(state.connected, state.endpoint) { playerHost.connectionChanged() }
            }
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (isActive) { playerHost.playback(); delay(250) }
            }
        }
    }
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) WindowCompat.getInsetsController(window, window.decorView).apply {
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            hide(WindowInsetsCompat.Type.systemBars())
        }
    }
    override fun onResume() { super.onResume(); if (::playerHost.isInitialized) playerHost.resume() }
    override fun onPause() { if (::playerHost.isInitialized) playerHost.pause(); super.onPause() }
    override fun onDestroy() { if (::playerHost.isInitialized) playerHost.destroy(); super.onDestroy() }
}
