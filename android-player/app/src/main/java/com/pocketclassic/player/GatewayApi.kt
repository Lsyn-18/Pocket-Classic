package com.pocketclassic.player

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import org.json.JSONObject

class GatewayApi(private val config: ConnectionConfig) {
    companion object {
        fun normalizedUrl(input: String): String {
            val uri = runCatching { URI(input.trim().trimEnd('/')) }.getOrNull() ?: throw IOException("服务地址格式不正确")
            val host = uri.host?.lowercase() ?: throw IOException("请输入完整的服务地址")
            val parts = host.split('.')
            val octets = parts.mapNotNull { it.toIntOrNull() }
            val ipv4 = octets.size == 4 && parts.size == 4 && octets.all { it in 0..255 } && parts.zip(octets).all { (text, number) -> text == number.toString() }
            val local = host == "localhost" || (ipv4 && (octets[0] == 127 || octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && octets[1] in 16..31)))
            if (uri.port != -1 && uri.port !in 1..65535) throw IOException("服务端口不正确")
            if (uri.userInfo != null || uri.query != null || uri.fragment != null || (!uri.path.isNullOrEmpty() && uri.path != "/")) throw IOException("服务地址只需填写协议、IP 和端口")
            if (uri.scheme != "https" && !(uri.scheme == "http" && local)) throw IOException("公网服务必须使用 HTTPS；本地服务可以使用 HTTP")
            return uri.toString()
        }
        fun pair(url: String, code: String): ConnectionConfig {
            val normalized = normalizedUrl(url)
            val result = GatewayApi(ConnectionConfig(normalized, "")).request("/pair", JSONObject().put("code", code))
            return ConnectionConfig(normalized, result.getString("token"))
        }
    }
    private fun request(route: String, body: JSONObject? = null): JSONObject {
        val connection = URI(config.baseUrl + route).toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 12000; connection.readTimeout = 30000
            connection.setRequestProperty("Accept", "application/json")
            if (config.token.isNotEmpty()) connection.setRequestProperty("Authorization", "Bearer ${config.token}")
            if (body != null) {
                connection.requestMethod = "POST"; connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = runCatching { JSONObject(text) }.getOrElse { throw IOException("服务返回了无法识别的内容") }
            if (status !in 200..299) throw IOException(json.optString("error", "服务暂不可用，请重试"))
            return json
        } finally { connection.disconnect() }
    }
    fun account(): AccountInfo = request("/api/status").let { AccountInfo(it.optBoolean("authenticated"), it.optString("nickname"), it.optString("message")) }
    fun browserApi(route: String): JSONObject {
        if (!NativeContract.allowedApi(route)) throw IOException("不支持此音乐操作")
        return request("/api/" + route)
    }
    fun roaming(): List<MusicTrack> {
        val list = request("/api/roam").getJSONArray("tracks")
        return List(list.length()) { trackFromJson(list.getJSONObject(it)) }.distinctBy { it.id }
    }
    fun playlists(): List<MusicPlaylist> {
        val list = request("/api/playlists").getJSONArray("playlists")
        return List(list.length()) { i -> list.getJSONObject(i).let { MusicPlaylist(it.getLong("id"), it.getString("name"), it.optInt("trackCount")) } }
    }
    fun tracks(id: Long): List<MusicTrack> {
        val list = request("/api/tracks?id=$id").getJSONArray("tracks")
        return List(list.length()) { trackFromJson(list.getJSONObject(it)) }.distinctBy { it.id }
    }
    fun resolve(id: Long): PlayResource {
        val result = request("/api/resolve", JSONObject().put("id", id))
        val url = result.optString("url").takeIf { it.startsWith("https://") || it.startsWith("http://") } ?: throw IOException("这首歌暂时没有可用音源，可能受账号或版权权限限制")
        return PlayResource(url, !result.isNull("trial"), result.optLong("durationMs"))
    }
}
