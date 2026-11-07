package com.pocketclassic.player

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics

@Composable
fun NetEaseLoginDialog(state: ClassicState,close:()->Unit,refresh:()->Unit,logout:()->Unit,save:()->Unit,open:()->Unit) {
    val phase=when(state.loginPhase) {
        "creating" -> "1 / 3  正在生成二维码"
        "confirm" -> "2 / 3  请在网易云确认授权"
        "expired" -> "二维码已过期"
        "error" -> "连接暂时未完成"
        else -> "1 / 3  扫码并确认，返回这里"
    }
    AlertDialog(onDismissRequest=close,shape=RoundedCornerShape(24.dp),
        title={ Text(if(state.connected) "网易云账号" else "连接你的音乐") },
        text={ Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(14.dp)) {
            if(state.connected) {
                Text(state.nickname,style=MaterialTheme.typography.titleMedium)
                Text("已连接 · 现在可以浏览歌单、每日推荐和私人漫游。",fontSize=14.sp,lineHeight=22.sp)
            } else {
                Text(phase,Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primary.copy(alpha=.08f),RoundedCornerShape(12.dp)).padding(12.dp),color=MaterialTheme.colorScheme.primary,fontSize=13.sp)
                Text("同一部手机：保存二维码并打开网易云，在「扫一扫 → 相册」选择二维码。确认后返回，播放器会自动连接。",fontSize=14.sp,lineHeight=23.sp)
                state.qrImage?.let { Image(it.asImageBitmap(),"网易云音乐授权二维码",Modifier.fillMaxWidth().size(210.dp)) }
                if(state.qrImage!=null) {
                    Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick=save) { Text("仅保存二维码") }
                        TextButton(onClick=refresh) { Text("重新生成") }
                    }
                    Text("也可以用另一台已登录网易云的设备扫码。",fontSize=12.sp,lineHeight=19.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if(state.busy)LinearProgressIndicator(Modifier.fillMaxWidth())
            if(state.message.isNotBlank())Text(state.message,Modifier.semantics { liveRegion=LiveRegionMode.Polite },fontSize=13.sp,lineHeight=20.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
        } },
        confirmButton={ if(!state.connected) Button(onClick=if(state.loginUrl.isNotBlank())open else refresh,enabled=!state.busy,shape=RoundedCornerShape(14.dp)) { Text(if(state.loginUrl.isNotBlank()) "保存并打开网易云" else "重新生成授权") } else Button(onClick=close,shape=RoundedCornerShape(14.dp)) { Text("继续听歌") } },
        dismissButton={ if(state.connected) TextButton(onClick=logout) { Text("退出账号") } else TextButton(onClick=close) { Text("稍后连接") } })
}
