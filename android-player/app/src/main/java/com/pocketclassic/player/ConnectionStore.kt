package com.pocketclassic.player

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class ConnectionStore(context: Context) {
    private val prefs = context.getSharedPreferences("pocket-classic", Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("pocket-classic-gateway", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("pocket-classic-gateway", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun read(): ConnectionConfig? = runCatching {
        val encrypted = prefs.getString("access", null) ?: return null
        val iv = prefs.getString("iv", null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))) }
        ConnectionConfig(prefs.getString("url", "")!!, String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8))
    }.getOrNull()
    fun save(config: ConnectionConfig) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        prefs.edit().putString("url", config.baseUrl).putString("access", Base64.encodeToString(cipher.doFinal(config.token.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP))
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).apply()
    }
    fun clear() { prefs.edit().remove("url").remove("access").remove("iv").apply() }
    var dark: Boolean get() = prefs.getBoolean("dark", false); set(value) { prefs.edit().putBoolean("dark", value).apply() }
    var haptics: Boolean get() = prefs.getBoolean("haptics", true); set(value) { prefs.edit().putBoolean("haptics", value).apply() }
}
