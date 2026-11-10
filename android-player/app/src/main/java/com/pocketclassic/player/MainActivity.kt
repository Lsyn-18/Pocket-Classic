package com.pocketclassic.player

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioManager
import android.net.Uri
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
    private var pendingQr: Bitmap? = null
    private var pendingOpenScanner = false
    private val imagePermission=registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val image=pendingQr;val open=pendingOpenScanner;pendingQr=null;pendingOpenScanner=false
        if(granted&&image!=null)saveLoginQr(image,open)
        else Toast.makeText(this,"未获得相册保存权限，可直接扫描屏幕上的二维码",Toast.LENGTH_LONG).show()
    }
    private fun saveLoginQr(image: Bitmap?,openScanner: Boolean=false) {
        if(image==null)return
        if(Build.VERSION.SDK_INT<29&&ContextCompat.checkSelfPermission(this,Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED) {
            pendingQr=image;pendingOpenScanner=openScanner;imagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE);return
        }
        lifecycleScope.launch {
            try { withContext(Dispatchers.IO) { LoginQrImage.save(this@MainActivity,image) };if(openScanner)openNetEaseScanner();Toast.makeText(this@MainActivity,"二维码已保存，请在网易云扫一扫中从相册选择",Toast.LENGTH_LONG).show() }
            catch(e: Exception) { Toast.makeText(this@MainActivity,e.message?:"二维码保存失败",Toast.LENGTH_LONG).show() }
        }
    }
    private fun openNetEaseScanner() {
        try { startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("orpheus://nm/base/scan")).setPackage("com.netease.cloudmusic")) }
        catch(_: android.content.ActivityNotFoundException) { Toast.makeText(this,"请先安装网易云音乐，或使用另一台设备扫码授权",Toast.LENGTH_LONG).show() }
    }
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
        volumeControlStream = AudioManager.STREAM_MUSIC
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 28) window.attributes = window.attributes.apply {
            layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= 30)
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            else WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        val vm = ViewModelProvider(this)[PlayerViewModel::class.java]
        val localMusic = LocalMusicAccess(this, vm.localMusic)
        var error by mutableStateOf("")
        playerHost = NativePlayerHost(this, vm, ::notificationPermission, localMusic::perform) { error = it }
        localMusic.onProgress=playerHost::localProgress
        onBackPressedDispatcher.addCallback(this) {
            if (vm.state.showConnection) vm.showConnection(false) else playerHost.back()
        }
        setContent {
            val state = vm.state
            val darkAppearance = state.theme == "dark" || state.theme == "auto" && isSystemInDarkTheme()
            MaterialTheme(colorScheme = if(darkAppearance) darkColorScheme(primary=Color(0xFF9ACBFA),surface=Color(0xFF1D2835),onSurface=Color(0xFFE5EDF6),onSurfaceVariant=Color(0xFFB9CADB)) else lightColorScheme(primary=Color(0xFF246AB4),surface=Color(0xFFF8FAFC),onSurface=Color(0xFF263F54),onSurfaceVariant=Color(0xFF4C6379))) {
                Box(Modifier.fillMaxSize().background(if(darkAppearance) Color(0xFF101B2B) else Color(0xFFF7F9FC))) {
                    AndroidView(factory = { playerHost.webView }, modifier = Modifier.fillMaxSize())
                }
                if (state.showConnection) NetEaseLoginDialog(state,
                    close={vm.showConnection(false)},refresh={vm.beginLogin()},logout={vm.disconnect()},
                    save={saveLoginQr(vm.state.qrImage)},open={saveLoginQr(vm.state.qrImage,true)})
                if (error.isNotBlank()) AlertDialog(onDismissRequest = { error = "" }, title = { Text("界面加载提示") },
                    text = { Text(error) }, confirmButton = { TextButton(onClick = { finish() }) { Text("关闭后重新打开") } })
                LaunchedEffect(state.connected, state.nickname) { playerHost.connectionChanged() }
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
