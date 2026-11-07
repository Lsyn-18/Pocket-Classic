package com.pocketclassic.player

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class MusicSession(val cookie: String, val userId: Long, val nickname: String, val id: String = UUID.randomUUID().toString())

class MusicSessionStore(context: Context) {
    private val prefs=context.getSharedPreferences("pocket-classic",Context.MODE_PRIVATE)
    init { if (!prefs.getBoolean("standalone",false)) prefs.edit().remove("url").remove("access").remove("iv").putBoolean("standalone",true).apply() }
    private fun key(): SecretKey {
        val store=KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("pocket-classic-netease",null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("pocket-classic-netease",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun read(): MusicSession?=runCatching {
        val value=prefs.getString("musicSession",null)?:return null
        val iv=prefs.getString("musicIv",null)?:return null
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP))) }
        val json=JSONObject(String(cipher.doFinal(Base64.decode(value,Base64.NO_WRAP)),Charsets.UTF_8))
        MusicSession(json.getString("cookie"),json.getLong("uid"),json.getString("nickname"),json.getString("id"))
    }.getOrNull()
    fun save(value: MusicSession) {
        val text=JSONObject().put("cookie",value.cookie).put("uid",value.userId).put("nickname",value.nickname).put("id",value.id).toString()
        val cipher=Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
        check(prefs.edit().putString("musicSession",Base64.encodeToString(cipher.doFinal(text.toByteArray(Charsets.UTF_8)),Base64.NO_WRAP)).putString("musicIv",Base64.encodeToString(cipher.iv,Base64.NO_WRAP)).commit()) { "无法保存手机登录状态，请重试" }
    }
    fun clear() { prefs.edit().remove("musicSession").remove("musicIv").apply() }
    val deviceId: String get()=prefs.getString("musicDevice",null)?:UUID.randomUUID().toString().replace("-","").also { prefs.edit().putString("musicDevice",it).apply() }
    var dark: Boolean get()=prefs.getBoolean("dark",false);set(value) { prefs.edit().putBoolean("dark",value).apply() }
    var haptics: Boolean get()=prefs.getBoolean("haptics",true);set(value) { prefs.edit().putBoolean("haptics",value).apply() }
    var quality: String get()=MusicQuality.restored(prefs.getString("quality",null));set(value) { require(MusicQuality.valid(value));prefs.edit().putString("quality",value).apply() }
}
