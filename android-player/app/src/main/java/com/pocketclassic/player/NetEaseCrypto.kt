package com.pocketclassic.player

import java.math.BigInteger
import java.security.KeyFactory
import java.security.SecureRandom
import java.security.interfaces.RSAPublicKey
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Compatible with the community API's weapi request encoding (MIT). */
object NetEaseCrypto {
    private const val publicKey = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB"
    private val rsa by lazy { KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(publicKey))) as RSAPublicKey }
    private val random = SecureRandom()
    private fun aes(text: String, key: String): String {
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key.toByteArray(Charsets.UTF_8), "AES"), IvParameterSpec("0102030405060708".toByteArray(Charsets.UTF_8)))
        return Base64.getEncoder().encodeToString(cipher.doFinal(text.toByteArray(Charsets.UTF_8)))
    }
    fun encode(text: String, secret: String = buildString { val alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; repeat(16) { append(alphabet[random.nextInt(alphabet.length)]) } }): Map<String,String> {
        require(secret.length == 16 && secret.all { it.isLetterOrDigit() && it.code < 128 })
        val encryptedKey=BigInteger(1,secret.reversed().toByteArray(Charsets.UTF_8)).modPow(rsa.publicExponent,rsa.modulus).toString(16).padStart(256,'0')
        return mapOf("params" to aes(aes(text,"0CoJUm6Qyw8W8jud"),secret), "encSecKey" to encryptedKey)
    }
}
