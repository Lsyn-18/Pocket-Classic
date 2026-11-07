package com.pocketclassic.player

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpCookie
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class LoginTicket(val key: String, var cookies: Map<String,String>) { val url get()="https://music.163.com/login?codekey="+URLEncoder.encode(key,"UTF-8") }
data class LoginPoll(val code: Int, val session: MusicSession? = null)
class NetEaseApi(private val store: MusicSessionStore) {
    private data class Response(val body: JSONObject,val cookies: Map<String,String>)
    private val device=store.deviceId
    private fun request(path: String, data: JSONObject=JSONObject(), cookie: String=""): Response {
        require(path.startsWith("/api/") && !path.contains('?') && !path.contains(".."))
        val cookies=linkedMapOf("os" to "pc","appver" to "3.1.17.204416","__remember_me" to "true","_ntes_nuid" to device)
        cookie.split(';').forEach { val parts=it.trim().split('=',limit=2);if(parts.size==2&&parts[0].matches(Regex("[A-Za-z0-9_]+")))cookies[parts[0]]=parts[1] }
        data.put("e_r",false).put("csrf_token",cookies["__csrf"]?:"")
        val encoded=NetEaseCrypto.encode(data.toString()).entries.joinToString("&") { URLEncoder.encode(it.key,"UTF-8")+"="+URLEncoder.encode(it.value,"UTF-8") }
        val connection=URL("https://music.163.com/weapi/"+path.removePrefix("/api/")).openConnection() as HttpURLConnection
        try {
            connection.requestMethod="POST";connection.doOutput=true;connection.instanceFollowRedirects=false
            connection.connectTimeout=12000;connection.readTimeout=20000
            connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded")
            connection.setRequestProperty("Referer","https://music.163.com/")
            connection.setRequestProperty("User-Agent","Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36")
            connection.setRequestProperty("Cookie",cookies.entries.joinToString("; ") { it.key+"="+it.value })
            connection.outputStream.use { it.write(encoded.toByteArray(Charsets.UTF_8)) }
            if(connection.responseCode !in 200..299)throw IOException("网易云暂时无法连接（"+connection.responseCode+"），请检查手机网络")
            val bytes=connection.inputStream.use { it.readBytes() }
            if(bytes.size>8_000_000)throw IOException("音乐列表过大，请选择较小的歌单")
            val body=runCatching { JSONObject(String(bytes,Charsets.UTF_8)) }.getOrElse { throw IOException("网易云返回了无法识别的内容，请稍后重试") }
            val updates=linkedMapOf<String,String>()
            connection.headerFields.filterKeys { it?.equals("Set-Cookie",true)==true }.values.flatten().forEach { raw ->
                runCatching { HttpCookie.parse(raw) }.getOrDefault(emptyList()).forEach { if(it.maxAge!=0L)updates[it.name]=it.value }
            }
            return Response(body,updates)
        } finally { connection.disconnect() }
    }
    private fun checked(response: Response): JSONObject {
        val code=response.body.optInt("code")
        if(code!=200)throw IOException(if(code==301||code==302)"网易云登录已过期，请重新登录" else "网易云暂时无法完成此操作（"+code+"），请稍后重试")
        return response.body
    }
    private fun current()=store.read()?:throw IOException("请先登录网易云音乐")
    private fun cookie(values: Map<String,String>)=values.entries.joinToString("; ") { it.key+"="+it.value }
    fun beginLogin(): LoginTicket {
        val response=request("/api/login/qrcode/unikey",JSONObject().put("type",3))
        val key=checked(response).optString("unikey");if(key.isBlank())throw IOException("未能生成登录授权，请重试")
        return LoginTicket(key,response.cookies)
    }
    fun pollLogin(ticket: LoginTicket): LoginPoll {
        val response=request("/api/login/qrcode/client/login",JSONObject().put("key",ticket.key).put("type",3),cookie(ticket.cookies))
        ticket.cookies=ticket.cookies+response.cookies
        val code=response.body.optInt("code")
        if(code!=803)return LoginPoll(code)
        if(ticket.cookies["MUSIC_U"].isNullOrBlank())throw IOException("网易云未返回登录凭证，请重新授权")
        val sessionCookie=cookie(ticket.cookies)
        val account=checked(request("/api/w/nuser/account/get",cookie=sessionCookie))
        val profile=account.optJSONObject("profile");val uid=profile?.optLong("userId")?:account.optJSONObject("account")?.optLong("id")?:0
        if(uid<=0)throw IOException("授权完成但未能确认账号，请重新登录")
        return LoginPoll(code,MusicSession(sessionCookie,uid,profile?.optString("nickname")?:"网易云用户"))
    }
    fun status(): JSONObject {
        val session=store.read()?:return JSONObject().put("authenticated",false).put("nickname","").put("message","在手机上登录网易云音乐即可使用")
        val body=checked(request("/api/w/nuser/account/get",cookie=session.cookie))
        val profile=body.optJSONObject("profile");val uid=profile?.optLong("userId")?:body.optJSONObject("account")?.optLong("id")?:0
        if(uid<=0)throw IOException("网易云登录已过期，请重新登录")
        ensureSession(session)
        return JSONObject().put("authenticated",true).put("nickname",profile?.optString("nickname")?:session.nickname).put("message","网易云已登录，手机独立播放")
    }
    private fun ensureSession(session: MusicSession) { if(store.read()?.id!=session.id)throw IOException("账号已变化，请重新打开音乐菜单") }
    private fun normalize(list: JSONArray): JSONArray {
        val result=JSONArray();val seen=hashSetOf<Long>()
        for(i in 0 until list.length()) {
            val t=list.optJSONObject(i)?:continue;val id=t.optLong("id");if(id<=0||!seen.add(id))continue
            val artists=t.optJSONArray("ar")?:t.optJSONArray("artists")?:JSONArray()
            val names=(0 until artists.length()).mapNotNull { artists.optJSONObject(it)?.optString("name")?.takeIf(String::isNotBlank) }
            val album=t.optJSONObject("al")?:t.optJSONObject("album")
            result.put(JSONObject().put("id",id).put("name",t.optString("name","未知歌曲")).put("artist",names.joinToString(" / ").ifBlank { "未知歌手" }).put("durationMs",t.optLong("dt",t.optLong("duration"))).put("fee",t.optInt("fee"))
                .put("cover",ArtworkPolicy.url(album?.optString("picUrl").orEmpty())?:"").put("album",album?.optString("name").orEmpty().take(1000)))
        }
        return result
    }
    fun browserApi(route: String): JSONObject {
        require(NativeContract.allowedApi(route))
        if(route=="status")return status()
        val session=current();val result=when {
            route.startsWith("artists?offset=") -> {
                val offset=route.substringAfter("offset=").toInt()
                val body=checked(request("/api/artist/sublist",JSONObject().put("offset",offset).put("limit",50).put("total",true),session.cookie))
                val list=body.optJSONArray("data")?:throw IOException("网易云歌手列表暂时无法识别")
                val output=JSONArray();val seen=hashSetOf<Long>()
                for(i in 0 until list.length())list.optJSONObject(i)?.let { a ->
                    val id=a.optLong("id");if(id>0&&seen.add(id))output.put(JSONObject().put("id",id).put("name",a.optString("name","未知歌手")).put("songCount",a.optInt("musicSize").coerceAtLeast(0)))
                }
                JSONObject().put("artists",output).put("nextOffset",offset+list.length()).put("more",hasMore(body,offset,list.length(),50))
            }
            route.startsWith("artist-tracks?id=") -> {
                val id=route.substringAfter("id=").substringBefore('&').toLong();val offset=route.substringAfter("offset=").toInt()
                val data=JSONObject().put("id",id).put("offset",offset).put("limit",100).put("order","hot").put("private_cloud","true").put("work_type",1)
                val body=checked(request("/api/v1/artist/songs",data,session.cookie))
                val songs=body.optJSONArray("songs")?:throw IOException("网易云歌手歌曲暂时无法识别")
                JSONObject().put("id",id).put("tracks",normalize(songs)).put("nextOffset",offset+songs.length()).put("more",hasMore(body,offset,songs.length(),100))
            }
            route=="playlists" -> {
                val body=checked(request("/api/user/playlist",JSONObject().put("uid",session.userId).put("limit",100).put("offset",0).put("includeVideo",true),session.cookie))
                val list=body.optJSONArray("playlist")?:JSONArray();val output=JSONArray()
                for(i in 0 until list.length())list.optJSONObject(i)?.let { output.put(JSONObject().put("id",it.optLong("id")).put("name",it.optString("name")).put("trackCount",it.optInt("trackCount"))) }
                JSONObject().put("playlists",output)
            }
            route.startsWith("tracks?id=") -> {
                val body=checked(request("/api/v6/playlist/detail",JSONObject().put("id",route.substringAfter('=').toLong()).put("n",100000).put("s",8),session.cookie))
                val list=body.optJSONObject("playlist")?:throw IOException("歌单暂不可用")
                JSONObject().put("id",list.optLong("id")).put("name",list.optString("name")).put("trackCount",list.optInt("trackCount")).put("tracks",normalize(list.optJSONArray("tracks")?:JSONArray()))
            }
            else -> {
                val daily=route=="daily";val path=if(daily)"/api/v3/discovery/recommend/songs" else "/api/v1/radio/get"
                val body=checked(request(path,if(daily)JSONObject().put("afresh",false) else JSONObject(),session.cookie))
                val tracks=normalize(if(daily)body.optJSONObject("data")?.optJSONArray("dailySongs")?:body.optJSONArray("recommend")?:JSONArray() else body.optJSONArray("data")?:JSONArray())
                JSONObject().put("source",route).put("name",if(daily)"每日推荐" else "私人漫游").put("tracks",tracks).put("trackCount",tracks.length())
            }
        }
        ensureSession(session);return result
    }
    private fun hasMore(body: JSONObject, offset: Int, count: Int, limit: Int): Boolean = count>0 && when {
        body.has("hasMore") && !body.isNull("hasMore") -> body.optBoolean("hasMore")
        body.has("more") && !body.isNull("more") -> body.optBoolean("more")
        body.has("count") && !body.isNull("count") -> offset+count<body.optInt("count")
        else -> count==limit
    }
    fun roaming(): List<MusicTrack> { val tracks=browserApi("roam").getJSONArray("tracks");return List(tracks.length()) { trackFromJson(tracks.getJSONObject(it)) } }
    fun resolve(id: Long, quality: String = store.quality): PlayResource {
        require(id>0 && MusicQuality.valid(quality));val session=current()
        val body=checked(request("/api/song/enhance/player/url/v1",JSONObject().put("ids","[$id]").put("level",quality).put("encodeType","flac"),session.cookie))
        ensureSession(session)
        val item=body.optJSONArray("data")?.optJSONObject(0)?:throw IOException("歌曲暂时没有可用音源")
        val url=item.optString("url");if(!url.startsWith("https://")&&!url.startsWith("http://"))throw IOException("这首歌受账号或版权权限限制，请尝试下一首")
        return PlayResource(url,!item.isNull("freeTrialInfo"),item.optLong("time"),item.optString("level"))
    }
}
