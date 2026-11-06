package com.pocketclassic.player

import android.Manifest
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.Player
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.min

private val Ink = Color(0xFF192126)
private val Blue = Color(0xFF247BDD)
private val Lcd = Color(0xFFF3F6EE)

class MainActivity : ComponentActivity() {
    private var askedNotifications = false
    private fun notificationPermission() {
        if (!askedNotifications && Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            askedNotifications = true
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val battery = getSystemService(BATTERY_SERVICE) as BatteryManager
        setContent {
            val vm: PlayerViewModel = viewModel()
            MaterialTheme(colorScheme = lightColorScheme(primary = Blue)) {
                Surface(color = Color(0xFFE9EBE7), modifier = Modifier.fillMaxSize()) {
                    ClassicApp(vm, battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)) { notificationPermission() }
                }
            }
        }
    }
}

@Composable private fun ClassicApp(vm: PlayerViewModel, battery: Int, beforePlay: () -> Unit) {
    val s = vm.state
    val haptics = LocalHapticFeedback.current
    fun tick() { if (s.haptics && !s.hold) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
    BackHandler(enabled = s.page != Page.HOME) { vm.menu() }
    BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp), contentAlignment = Alignment.Center) {
        val width = minOf(maxWidth, maxHeight * .60f, 390.dp)
        val shellColors = if (s.dark) listOf(Color(0xFF484B4E), Color(0xFF242729), Color(0xFF3C4043)) else listOf(Color(0xFFF6F7F6), Color(0xFFCFD2D4), Color(0xFFF2F3F1))
        Column(Modifier.width(width).height(width / .60f).shadow(20.dp, RoundedCornerShape(27.dp))
            .clip(RoundedCornerShape(27.dp)).background(Brush.horizontalGradient(shellColors))
            .border(1.dp, if (s.dark) Color(0xFF555A5C) else Color.White, RoundedCornerShape(27.dp)).padding(horizontal = 22.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth().height(34.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Row(Modifier.height(34.dp).width(90.dp).clickable { vm.hold() }.semantics { contentDescription = if (s.hold) "解除按键锁定" else "锁定按键" }, verticalAlignment = Alignment.CenterVertically) {
                    Text("HOLD", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = if (s.dark) Color(0xFFADB3B5) else Color(0xFF697174))
                    Spacer(Modifier.width(7.dp))
                    Box(Modifier.width(30.dp).height(12.dp).clip(RoundedCornerShape(6.dp)).background(if (s.hold) Color(0xFFE98D38) else Color(0xFF7C8385)).padding(2.dp)) {
                        Box(Modifier.align(if (s.hold) Alignment.CenterEnd else Alignment.CenterStart).width(13.dp).fillMaxHeight().clip(RoundedCornerShape(4.dp)).background(Color(0xFFEEF0EE)))
                    }
                }
                Text("POCKET CLASSIC", fontSize = 8.sp, letterSpacing = 1.6.sp, color = if (s.dark) Color(0xFFA2A8AB) else Color(0xFF747D7F))
            }
            Box(Modifier.fillMaxWidth().weight(1f).shadow(2.dp, RoundedCornerShape(9.dp)).clip(RoundedCornerShape(9.dp)).background(Color(0xFF202629)).padding(5.dp)) {
                if (s.sleeping) Box(Modifier.fillMaxSize().background(Color(0xFF151B1B)).clickable { vm.wake() })
                else LcdScreen(s, battery, { index -> tick(); if (s.page == Page.TRACKS) beforePlay(); vm.choose(index) }, { vm.retry() })
            }
            Spacer(Modifier.height(24.dp))
            val wheelWidth = width * .78f
            ClickWheel(Modifier.size(wheelWidth), s.dark, s.hold,
                rotate = { tick(); vm.rotate(it) }, menu = { tick(); vm.menu() }, menuLong = { vm.menu(true) },
                select = { tick(); if (s.page == Page.TRACKS) beforePlay(); vm.choose() }, selectLong = { vm.more() },
                play = { tick(); beforePlay(); vm.togglePlayback() }, sleep = { vm.sleep() },
                previous = { tick(); vm.previous() }, next = { tick(); vm.next() }, rewind = { vm.seekBy(-2000) }, forward = { vm.seekBy(2000) })
            Spacer(Modifier.height(13.dp))
            Text(if (s.hold) "HOLD · 按键已锁定" else "MUSIC. AT YOUR FINGERTIPS.", fontSize = 7.sp, letterSpacing = 1.3.sp, color = if (s.dark) Color(0xFF929A9E) else Color(0xFF7D8587))
            Spacer(Modifier.height(7.dp))
        }
    }
    if (s.showConnection) ConnectionDialog(s, vm)
    if (s.showMore) AlertDialog(onDismissRequest = { vm.more(false) }, title = { Text(s.current?.name ?: "更多操作") }, text = { Column {
        TextButton(onClick = { vm.more(false); vm.nowPlaying() }) { Text("打开正在播放") }
        TextButton(onClick = { vm.more(false); vm.menu(true) }) { Text("返回主菜单") }
        Text("播放队列 ${s.queueCount} 首 · 第 ${s.queueIndex + 1} 首", fontSize = 13.sp)
    } }, confirmButton = { TextButton(onClick = { vm.more(false) }) { Text("完成") } })
}

@Composable private fun LcdScreen(s: ClassicState, battery: Int, choose: (Int) -> Unit, retry: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Lcd)) {
        Row(Modifier.fillMaxWidth().height(29.dp).background(Brush.verticalGradient(listOf(Color(0xFFFEFFFC), Color(0xFFD3D8CE)))).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(s.title, color = Ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            if (s.hold) Text("锁", fontSize = 10.sp, color = Ink, modifier = Modifier.padding(end = 5.dp))
            if (s.playing) Symbol("play", Modifier.size(10.dp), Ink)
            Spacer(Modifier.width(7.dp))
            Canvas(Modifier.width(23.dp).height(11.dp).semantics { contentDescription = "电量 $battery%" }) {
                drawRect(Ink, size = Size(size.width - 3f, size.height), style = Stroke(1.5f))
                drawRect(Ink, topLeft = Offset(size.width - 2f, size.height * .3f), size = Size(2f, size.height * .4f))
                drawRect(Color(0xFF5E8457), topLeft = Offset(3f, 3f), size = Size((size.width - 9f) * battery.coerceIn(0, 100) / 100, (size.height - 6f).coerceAtLeast(0f)))
            }
        }
        Box(Modifier.fillMaxWidth().weight(1f)) {
            when (s.page) {
                Page.HOME -> Row(Modifier.fillMaxSize()) {
                    MenuList(listOf("音乐", "正在播放", "随机播放歌曲", "设置"), s.selected, choose, Modifier.weight(.62f))
                    Box(Modifier.weight(.38f).fillMaxHeight().background(Color(0xFFE0E5DD)), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        AlbumArt(0, Modifier.size(68.dp))
                        Text("MUSIC", fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, color = Color(0xFF667468), modifier = Modifier.padding(top = 12.dp))
                    } }
                }
                Page.PLAYLISTS -> MenuList(s.playlists.map { it.name }, s.selected, choose, Modifier.fillMaxSize(), s.playlists.map { "${it.trackCount} 首" })
                Page.TRACKS -> MenuList(s.tracks.map { it.name }, s.selected, choose, Modifier.fillMaxSize(), s.tracks.map { it.artist })
                Page.SETTINGS -> MenuList(listOf("连接网易云音乐", "机身颜色", "触感反馈", "随机播放", "循环模式", "关于"), s.selected, choose, Modifier.fillMaxSize(), listOf(if (s.connected) "已连接" else "未连接", if (s.dark) "曜石黑" else "银色", if (s.haptics) "开" else "关", if (s.shuffle) "开" else "关", when(s.repeat) { Player.REPEAT_MODE_ONE -> "单曲"; Player.REPEAT_MODE_ALL -> "全部"; else -> "关闭" }, "0.1"))
                Page.NOW_PLAYING -> NowPlaying(s)
            }
            if (s.busy) Box(Modifier.fillMaxSize().background(Lcd.copy(alpha = .88f)), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(25.dp), color = Blue, strokeWidth = 2.dp) }
            if (!s.busy && ((s.page == Page.TRACKS && s.tracks.isEmpty()) || (s.page == Page.PLAYLISTS && s.playlists.isEmpty()))) Text("暂无歌曲或歌单", fontSize = 13.sp, color = Color(0xFF6A736A), modifier = Modifier.align(Alignment.Center))
        }
        if (s.message.isNotBlank()) Text(s.message, fontSize = 10.sp, lineHeight = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, color = Color(0xFF914A26), modifier = Modifier.fillMaxWidth().background(Color(0xFFFFEBCB)).clickable(enabled = s.current != null, onClick = retry).padding(5.dp))
        else if (s.page != Page.NOW_PLAYING) Text(if (s.connected) "网易云音乐 · ${s.nickname}" else "转动转轮浏览 · 中央键选择", fontSize = 9.sp, color = Color(0xFF5D6D60), maxLines = 1, modifier = Modifier.fillMaxWidth().background(Color(0xFFE7EBE1)).padding(horizontal = 7.dp, vertical = 4.dp))
    }
}

@Composable private fun MenuList(labels: List<String>, selected: Int, choose: (Int) -> Unit, modifier: Modifier, details: List<String> = emptyList()) {
    val scroll = rememberLazyListState()
    LaunchedEffect(selected, labels.size) { if (selected in labels.indices) scroll.animateScrollToItem(selected) }
    LazyColumn(modifier, state = scroll) { itemsIndexed(labels) { index, label ->
        val active = index == selected
        Row(Modifier.fillMaxWidth().height(if (details.isEmpty()) 39.dp else 45.dp)
            .then(if (active) Modifier.background(Brush.verticalGradient(listOf(Color(0xFF52A1EF), Color(0xFF1763BC)))) else Modifier)
            .clickable { choose(index) }.semantics { this.selected = active }.padding(horizontal = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, fontSize = 13.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium, color = if (active) Color.White else Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                details.getOrNull(index)?.let { Text(it, fontSize = 9.sp, color = if (active) Color(0xFFE1EFFF) else Color(0xFF758071), maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
            Text("›", fontSize = 20.sp, color = if (active) Color.White else Color(0xFF737D73))
        }
    } }
}

@Composable private fun NowPlaying(s: ClassicState) {
    val track = s.current
    if (track == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("还没有正在播放的歌曲", fontSize = 13.sp) }; return }
    Column(Modifier.fillMaxSize().padding(10.dp), verticalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AlbumArt(track.id, Modifier.size(78.dp))
            Column(Modifier.padding(start = 11.dp).weight(1f)) {
                Text(track.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Ink, maxLines = 2, lineHeight = 18.sp, overflow = TextOverflow.Ellipsis)
                Text(track.artist, fontSize = 11.sp, color = Color(0xFF667367), maxLines = 2, modifier = Modifier.padding(top = 4.dp))
                Text("${s.queueIndex + 1} / ${s.queueCount}" + if (s.buffering) " · 缓冲中" else "", fontSize = 9.sp, color = Color(0xFF768173), modifier = Modifier.padding(top = 5.dp))
            }
        }
        Column {
            val trial = s.durationMs > 0 && s.durationMs + 2000 < track.durationMs
            Text(if (trial) "试听片段" else if (s.dial == DialMode.SEEK) "转动转轮调整进度" else "转动转轮调整音量", fontSize = 9.sp, color = if (trial) Color(0xFFA06A32) else Color(0xFF69766A), modifier = Modifier.padding(bottom = 6.dp))
            Progress((s.positionMs.toFloat() / s.durationMs.coerceAtLeast(1)).coerceIn(0f, 1f), s.dial == DialMode.SEEK)
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(formatTime(s.positionMs), fontSize = 10.sp, color = Ink); Text("−" + formatTime(s.durationMs - s.positionMs), fontSize = 10.sp, color = Ink) }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (s.shuffle) "随机" else "音量", fontSize = 9.sp, color = Color(0xFF69766A))
                Box(Modifier.weight(1f).padding(horizontal = 8.dp)) { Progress(s.volume / 100f, false) }
                Text("${s.volume}%", fontSize = 9.sp, color = Color(0xFF69766A))
            }
        }
    }
}

@Composable private fun Progress(fraction: Float, active: Boolean) { Box(Modifier.fillMaxWidth().height(if (active) 9.dp else 6.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFD0D8CB))) { Box(Modifier.fillMaxHeight().fillMaxWidth(fraction.coerceIn(0f, 1f)).background(Brush.verticalGradient(listOf(Color(0xFF68ADF0), Color(0xFF2672C3))))) } }

@Composable private fun AlbumArt(id: Long, modifier: Modifier) {
    val palettes = listOf(listOf(Color(0xFF273E3C), Color(0xFF90AD97)), listOf(Color(0xFF9F6547), Color(0xFFE2BA85)), listOf(Color(0xFF3D5575), Color(0xFFA4BACD)))
    Canvas(modifier.clip(RoundedCornerShape(3.dp)).background(Brush.linearGradient(palettes[(id % palettes.size).toInt()]))) {
        val center = Offset(size.width * .5f, size.height * .53f)
        drawCircle(Color.White.copy(alpha = .12f), size.width * .40f, center)
        drawCircle(Color.White.copy(alpha = .14f), size.width * .29f, center, style = Stroke(size.width * .025f))
        drawCircle(Color(0xFF1D3030).copy(alpha = .65f), size.width * .19f, center)
        drawCircle(Color(0xFFDCE3D1), size.width * .045f, center)
        drawLine(Color.White.copy(alpha = .3f), Offset(0f, size.height * .12f), Offset(size.width, size.height * .12f), size.height * .025f)
    }
}

@Composable private fun ClickWheel(modifier: Modifier, dark: Boolean, locked: Boolean, rotate: (Int) -> Unit, menu: () -> Unit, menuLong: () -> Unit,
    select: () -> Unit, selectLong: () -> Unit, play: () -> Unit, sleep: () -> Unit, previous: () -> Unit, next: () -> Unit, rewind: () -> Unit, forward: () -> Unit) {
    val onRotate by rememberUpdatedState(rotate)
    val color = if (dark) Color(0xFFC4CACD) else Color(0xFF899194)
    val gradient = if (dark) listOf(Color(0xFF2D3235), Color(0xFF191D1F)) else listOf(Color(0xFFFCFCF9), Color(0xFFE5E7E3))
    Box(modifier.shadow(1.dp, CircleShape).clip(CircleShape).background(Brush.linearGradient(gradient)).border(1.dp, if (dark) Color(0xFF52585C) else Color(0xFFD4D8D6), CircleShape)
        .pointerInput(locked) {
            var last = 0f; var accumulated = 0f; var valid = false
            detectDragGestures(onDragStart = { start -> val d = start - Offset(size.width / 2f, size.height / 2f); valid = d.getDistance() > size.width * .19f; last = atan2(d.y, d.x); accumulated = 0f }, onDrag = { change, _ ->
                if (valid && !locked) { val d = change.position - Offset(size.width / 2f, size.height / 2f); val angle = atan2(d.y, d.x); accumulated += normalizedAngleDelta(last, angle); last = angle
                    val steps = (accumulated / .15f).toInt(); if (steps != 0) { accumulated -= steps * .15f; onRotate(steps.coerceIn(-4, 4)) }; change.consume() }
            })
        }) {
        WheelButton("返回菜单，长按返回主页", Modifier.align(Alignment.TopCenter).fillMaxWidth(.5f).height(60.dp), menu, menuLong) { Text("MENU", fontSize = 12.sp, letterSpacing = 1.3.sp, fontWeight = FontWeight.Bold, color = color) }
        WheelButton("上一曲，长按快退", Modifier.align(Alignment.CenterStart).width(65.dp).height(65.dp), previous, rewind, true) { Symbol("previous", Modifier.size(26.dp), color) }
        WheelButton("下一曲，长按快进", Modifier.align(Alignment.CenterEnd).width(65.dp).height(65.dp), next, forward, true) { Symbol("next", Modifier.size(26.dp), color) }
        WheelButton("播放暂停，长按休眠", Modifier.align(Alignment.BottomCenter).fillMaxWidth(.5f).height(60.dp), play, sleep) { Symbol("toggle", Modifier.size(25.dp), color) }
        WheelButton("选择，长按更多", Modifier.align(Alignment.Center).fillMaxSize(.36f).shadow(2.dp, CircleShape).clip(CircleShape)
            .background(Brush.linearGradient(if (dark) listOf(Color(0xFF434A4E), Color(0xFF272C2F)) else listOf(Color(0xFFF2F3F1), Color(0xFFCDD2CF))))
            .border(1.dp, if (dark) Color(0xFF60686B) else Color(0xFFBCC3BF), CircleShape), select, selectLong) {}
    }
}

@Composable private fun WheelButton(label: String, modifier: Modifier, onTap: () -> Unit, onHold: () -> Unit, repeatHold: Boolean = false, content: @Composable BoxScope.() -> Unit) {
    val tap by rememberUpdatedState(onTap); val hold by rememberUpdatedState(onHold)
    var held by remember { mutableStateOf(false) }
    Box(modifier.semantics { contentDescription = label; role = Role.Button; onClick { tap(); true }; onLongClick { hold(); true } }
        .pointerInput(repeatHold) { detectTapGestures(onPress = {
            held = false
            coroutineScope { val job = launch { delay(480); held = true; hold(); if (repeatHold) while (true) { delay(180); hold() } }; try { tryAwaitRelease() } finally { job.cancel() } }
        }, onTap = { if (!held) tap() }) }, contentAlignment = Alignment.Center, content = content)
}

@Composable private fun Symbol(kind: String, modifier: Modifier, color: Color) {
    Canvas(modifier) {
        fun triangle(x: Float, y: Float, w: Float, h: Float, reverse: Boolean = false) { drawPath(Path().apply { if (reverse) { moveTo(x + w, y); lineTo(x, y + h / 2); lineTo(x + w, y + h) } else { moveTo(x, y); lineTo(x + w, y + h / 2); lineTo(x, y + h) }; close() }, color) }
        val w = size.width; val h = size.height
        when (kind) {
            "previous" -> { drawRect(color, Offset(w * .1f, h * .27f), Size(w * .09f, h * .46f)); triangle(w * .2f, h * .27f, w * .30f, h * .46f, true); triangle(w * .5f, h * .27f, w * .30f, h * .46f, true) }
            "next" -> { triangle(w * .2f, h * .27f, w * .30f, h * .46f); triangle(w * .5f, h * .27f, w * .30f, h * .46f); drawRect(color, Offset(w * .81f, h * .27f), Size(w * .09f, h * .46f)) }
            "toggle" -> { triangle(w * .08f, h * .24f, w * .37f, h * .52f); drawRect(color, Offset(w * .6f, h * .24f), Size(w * .11f, h * .52f)); drawRect(color, Offset(w * .8f, h * .24f), Size(w * .11f, h * .52f)) }
            else -> triangle(w * .1f, 0f, w * .8f, h)
        }
    }
}

@Composable private fun ConnectionDialog(s: ClassicState, vm: PlayerViewModel) {
    var url by remember { mutableStateOf(s.endpoint) }
    var code by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = { vm.showConnection(false) }, title = { Text("连接网易云音乐") }, text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("电脑与手机连接同一 Wi-Fi，在电脑连接页查看服务地址和 6 位配对码。", fontSize = 13.sp, lineHeight = 20.sp)
        OutlinedTextField(value = url, onValueChange = { url = it }, label = { Text("服务地址") }, placeholder = { Text("http://192.168.1.10:17864") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), singleLine = true)
        OutlinedTextField(value = code, onValueChange = { code = it.filter(Char::isDigit).take(6) }, label = { Text("6 位配对码") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true)
        if (s.connected) Text("已连接：${s.nickname}", fontSize = 13.sp, color = Blue)
        if (s.message.isNotBlank()) Text(s.message, color = Color(0xFF995224), fontSize = 12.sp)
        if (s.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
    } }, confirmButton = { TextButton(enabled = !s.busy && code.length == 6 && url.isNotBlank(), onClick = { vm.pair(url, code) }) { Text("配对连接") } },
        dismissButton = { Row { if (s.connected) TextButton(onClick = { vm.disconnect() }) { Text("断开") }; TextButton(onClick = { vm.showConnection(false) }) { Text("取消") } } })
}
