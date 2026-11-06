package com.pocketclassic.player

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Environment
import android.provider.MediaStore

object LoginQrImage {
    fun save(context: Context,bitmap: Bitmap) {
        val values=ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME,"PocketClassic-login-"+System.currentTimeMillis()+".png")
            put(MediaStore.Images.Media.MIME_TYPE,"image/png")
            if(Build.VERSION.SDK_INT>=29) { put(MediaStore.Images.Media.RELATIVE_PATH,Environment.DIRECTORY_PICTURES+"/PocketClassic");put(MediaStore.Images.Media.IS_PENDING,1) }
        }
        val resolver=context.contentResolver
        val uri=resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values)?:error("无法保存二维码，请检查手机存储空间")
        try {
            resolver.openOutputStream(uri)?.use { check(bitmap.compress(Bitmap.CompressFormat.PNG,100,it)) }?:error("无法写入相册")
            if(Build.VERSION.SDK_INT>=29)resolver.update(uri,ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING,0) },null,null)
        } catch(e: Exception) { resolver.delete(uri,null,null);throw e }
    }
}
