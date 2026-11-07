package com.pocketclassic.player

import android.annotation.SuppressLint
import java.io.DataInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

/** Local standard NCM container decoding. Format reference: taurusxin/ncmdump (MIT). */
object NcmDecoder {
    data class Header(val metadata: String, val key: IntArray)
    private val core = hex("687a4852416d736f356b496e62617857")
    private val metadataKey = hex("2331346c6a6b5f215c5d2630553c2728")
    private fun hex(value: String) = value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    @SuppressLint("GetInstance") // Required to read existing NCM; never used to encrypt app secrets.
    private fun decrypt(value: ByteArray, key: ByteArray): ByteArray = try {
        Cipher.getInstance("AES/ECB/PKCS5Padding").apply { init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES")) }.doFinal(value)
    } catch (e: Exception) { throw IOException("无法识别此 NCM 文件，请在网易云导出普通音频后导入", e) }
    private fun DataInputStream.length(max: Int): Int {
        val value = Integer.reverseBytes(readInt())
        if (value !in 0..max) throw IOException("NCM 文件损坏或版本不受支持")
        return value
    }
    private fun DataInputStream.block(max: Int): ByteArray = ByteArray(length(max)).also { readFully(it) }
    private fun DataInputStream.skipExactly(size: Int) {
        var remaining = size
        while (remaining > 0) { val n = skipBytes(remaining); if (n == 0) throw IOException("NCM 文件不完整"); remaining -= n }
    }
    fun header(input: InputStream): Header {
        val data = DataInputStream(input)
        val magic = ByteArray(8).also { data.readFully(it) }
        if (String(magic, Charsets.US_ASCII) != "CTENFDAM") throw IOException("不是标准 NCM 音乐文件")
        data.skipExactly(2)
        val encrypted = data.block(65536).also { bytes -> for (i in bytes.indices) bytes[i] = (bytes[i].toInt() xor 0x64).toByte() }
        val raw = decrypt(encrypted, core)
        val prefix = "neteasecloudmusic".toByteArray()
        if (raw.size <= prefix.size || !raw.copyOfRange(0, prefix.size).contentEquals(prefix)) throw IOException("不支持此 NCM 文件版本")
        val key = raw.copyOfRange(prefix.size, raw.size)
        val box = IntArray(256) { it }; var last = 0
        for (i in box.indices) { val swap = box[i]; val next = (swap + last + (key[i % key.size].toInt() and 255)) and 255; box[i] = box[next]; box[next] = swap; last = next }
        val encoded = data.block(4 * 1024 * 1024)
        var metadata = ""
        if (encoded.isNotEmpty()) {
            for (i in encoded.indices) encoded[i] = (encoded[i].toInt() xor 0x63).toByte()
            val text = String(encoded, Charsets.UTF_8)
            if (!text.startsWith("163 key(Don't modify):")) throw IOException("NCM 元数据无法识别")
            val decoded = try { Base64.getDecoder().decode(text.substring(22)) } catch (e: Exception) { throw IOException("NCM 元数据损坏", e) }
            val plain = String(decrypt(decoded, metadataKey), Charsets.UTF_8)
            if (plain.startsWith("music:")) metadata = plain.substring(6)
        }
        data.skipExactly(5) // CRC32 and cover version.
        val allocated = data.length(32 * 1024 * 1024)
        val actual = data.length(allocated)
        data.skipExactly(actual); data.skipExactly(allocated - actual)
        return Header(metadata, box)
    }
    fun decode(input: InputStream, output: OutputStream) {
        val header = header(input); val buffer = ByteArray(64 * 1024); var offset = 0L
        while (true) {
            val count = input.read(buffer); if (count < 0) break; if (count == 0) continue
            if (offset + count > 512L * 1024 * 1024) throw IOException("音乐文件过大")
            for (i in 0 until count) { val j = ((offset + i + 1) and 255).toInt(); val key = header.key[(header.key[j] + header.key[(header.key[j] + j) and 255]) and 255]; buffer[i] = (buffer[i].toInt() xor key).toByte() }
            output.write(buffer, 0, count); offset += count
        }
        if (offset == 0L) throw IOException("NCM 文件没有音频内容")
    }
}
