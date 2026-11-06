package com.pocketclassic.player

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.Composable

@Composable
fun NetEaseLoginDialog(state: ClassicState,close:()->Unit,refresh:()->Unit,logout:()->Unit,save:()->Unit,open:()->Unit) {
    AlertDialog(onDismissRequest=close,title={ Text(if(state.connected)"网易云账号" else "登录网易云音乐") },
        text={ Column(Modifier.verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            if(state.connected) {
                Text("已登录："+state.nickname)
                Text("歌单、推荐和播放均由手机直接连接网易云音乐。",fontSize=13.sp,lineHeight=20.sp)
            } else {
                Text("点击下方按钮保存二维码并前往网易云，在「扫一扫 → 相册」选择它并确认，返回播放器后自动完成登录。",fontSize=13.sp,lineHeight=20.sp)
                state.qrImage?.let { Image(it.asImageBitmap(),"网易云登录授权二维码",Modifier.fillMaxWidth().size(220.dp)) }
                if(state.qrImage!=null) {
                    Text("可直接用网易云扫描此二维码，也可在同一部手机上从相册授权。",fontSize=12.sp,lineHeight=18.sp)
                    Row { TextButton(onClick=save) { Text("保存二维码") };TextButton(onClick=refresh) { Text("重新生成") } }
                }
            }
            if(state.busy)LinearProgressIndicator(Modifier.fillMaxWidth())
            if(state.message.isNotBlank())Text(state.message,fontSize=12.sp,color=MaterialTheme.colorScheme.onSurfaceVariant)
        } },
        confirmButton={ if(!state.connected)TextButton(onClick=if(state.loginUrl.isNotBlank())open else refresh,enabled=!state.busy) { Text(if(state.loginUrl.isNotBlank())"保存并打开网易云" else "生成登录授权") } else TextButton(onClick=close) { Text("完成") } },
        dismissButton={ Row { if(state.connected)TextButton(onClick=logout) { Text("退出账号") };TextButton(onClick=close) { Text("关闭") } } })
}
