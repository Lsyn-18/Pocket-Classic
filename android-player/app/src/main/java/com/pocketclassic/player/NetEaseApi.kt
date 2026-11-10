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
    private data class PlaylistCache(val session: String,val id: Long,val name: String,val index: PlaylistTrackIndex<JSONObject>,val token: String=java.util.UUID.randomUUID().toString())
    private val snapshots=linkedMapOf<String,PlaylistCache>()
    private var likedCache: PlaylistCache? = null
    private var playlistCache: PlaylistCache? = null
    private fun request(path: String, data: JSONObject=JSONObject(), cookie: String="",mobile: Boolean=false): Response {
        require(path.startsWith("/api/") && !path.contains('?') && !path.contains(".."))
        val cookies=linkedMapOf("os" to "pc","appver" to "3.1.17.204416","__remember_me" to "true","_ntes_nuid" to device)
        cookie.split(';').forEach { val parts=it.trim().split('=',limit=2);if(parts.size==2&&parts[0].matches(Regex("[A-Za-z0-9_]+")))cookies[parts[0]]=parts[1] }
        if(mobile){
            cookies["os"]="android";cookies["osver"]="14";cookies["appver"]="9.1.65";cookies["deviceId"]=device
            cookies["buildver"]=(System.currentTimeMillis()/1000).toString()
            cookies["requestId"]=System.currentTimeMillis().toString()+"_"+java.util.concurrent.ThreadLocalRandom.current().nextInt(1000).toString().padStart(4,'0')
            val header=JSONObject().put("os","android").put("osver","14").put("appver","9.1.65").put("deviceId",device).put("buildver",cookies["buildver"]).put("versioncode","140").put("resolution","1920x1080").put("__csrf",cookies["__csrf"]?:"").put("requestId",cookies["requestId"])
            for(key in listOf("MUSIC_U","MUSIC_A","NMTID"))cookies[key]?.let { header.put(key,it) }
            data.put("header",header)
        }
        data.put("e_r",false).put("csrf_token",cookies["__csrf"]?:"")
        val encoded=(if(mobile)NetEaseCrypto.encodeEapi(path,data.toString()) else NetEaseCrypto.encode(data.toString())).entries.joinToString("&") { URLEncoder.encode(it.key,"UTF-8")+"="+URLEncoder.encode(it.value,"UTF-8") }
        val connection=URL((if(mobile)"https://interface3.music.163.com/eapi/" else "https://music.163.com/weapi/")+path.removePrefix("/api/")).openConnection() as HttpURLConnection
        try {
            connection.requestMethod="POST";connection.doOutput=true;connection.instanceFollowRedirects=false
            connection.connectTimeout=12000;connection.readTimeout=20000
            connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded")
            connection.setRequestProperty("Referer","https://music.163.com/")
            connection.setRequestProperty("User-Agent",if(mobile)"NeteaseMusic/9.1.65 (Android 14)" else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36")
            connection.setRequestProperty("Cookie",cookies.entries.joinToString("; ") { it.key+"="+it.value })
            connection.outputStream.use { it.write(encoded.toByteArray(Charsets.UTF_8)) }
            if(connection.responseCode !in 200..299)throw MusicProblem(if(connection.responseCode==401)"auth" else "network","网易云暂时无法连接（"+connection.responseCode+"），请检查手机网络")
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
        if(code!=200)throw MusicProblem(if(code==301||code==302)"auth" else "unknown",if(code==301||code==302)"网易云登录已过期，请重新登录" else "网易云暂时无法完成此操作（"+code+"），请稍后重试")
        return response.body
    }
    private fun current()=store.read()?:throw MusicProblem("auth","请先登录网易云音乐")
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
        if(uid<=0)throw MusicProblem("auth","网易云登录已过期，请重新登录")
        ensureSession(session)
        return JSONObject().put("authenticated",true).put("nickname",profile?.optString("nickname")?:session.nickname).put("message","网易云已登录，手机独立播放")
    }
    private fun ensureSession(session: MusicSession) { if(store.read()?.id!=session.id)throw MusicProblem("auth","账号已变化，请重新打开音乐菜单") }
    private fun ownLiked(item: JSONObject,session: MusicSession): Boolean {
        val owner=item.optLong("userId",item.optJSONObject("creator")?.optLong("userId")?:0L)
        return item.optLong("id")>0 && isOwnLikedPlaylist(item.optInt("specialType"),owner,session.userId)
    }
    private fun playlistGroup(session: MusicSession,group: String,stopAt: ((JSONObject)->Boolean)?=null): List<JSONObject> {
        val rows=mutableListOf<JSONObject>()
        for(offset in 0 until 5000 step 100){
            val data=JSONObject().put("userId",session.userId).put("limit",100).put("offset",offset).put("isWebview","true").put("includeRedHeart","true").put("includeTop","true")
            val body=checked(request("/api/user/playlist/"+group,data,session.cookie,mobile=true))
            ensureSession(session);val payload=body.optJSONObject("data")?:body
            val list=payload.optJSONArray("playlist")?:throw IOException("网易云歌单顺序暂时无法读取，请稍后重试")
            for(i in 0 until list.length())list.optJSONObject(i)?.let { item ->
                if(group=="collect")item.put("subscribed",true);rows.add(item)
                if(stopAt?.invoke(item)==true)return rows
            }
            if(!hasMore(payload,offset,list.length(),100))return rows
        }
        throw IOException("歌单过多，暂时无法完整读取，请稍后重试")
    }
    private fun playlistSnapshot(session: MusicSession,id: Long,requireOrder: Boolean=false): PlaylistCache {
        val body=checked(request("/api/v6/playlist/detail",JSONObject().put("id",id).put("n",100000).put("s",8),session.cookie))
        ensureSession(session)
        val list=body.optJSONObject("playlist")?:throw IOException("歌单暂不可用")
        val raw=list.optJSONArray("trackIds")
        if(requireOrder && raw==null)throw IOException("喜欢的音乐顺序暂时无法读取，请稍后重试")
        val order=raw?.let { (0 until it.length()).map { index -> it.optJSONObject(index)?.optLong("id")?:it.optLong(index) } }
        val songs=normalize(list.optJSONArray("tracks")?:JSONArray())
        return PlaylistCache(session.id,id,list.optString("name"),PlaylistTrackIndex(order,List(songs.length()) { songs.getJSONObject(it) }) { it.getLong("id") }).also { cached -> synchronized(snapshots) { snapshots[cached.token]=cached;while(snapshots.size>12)snapshots.remove(snapshots.keys.first()) } }
    }
    private fun playlistPage(session: MusicSession,cached: PlaylistCache,offset: Int,size: Int=1000): JSONObject {
        val page=cached.index.page(offset,size) { ids ->
            val data=JSONObject().put("c",JSONArray(ids.map { JSONObject().put("id",it) }).toString())
            val songs=normalize(checked(request("/api/v3/song/detail",data,session.cookie)).optJSONArray("songs")?:JSONArray())
            ensureSession(session);List(songs.length()) { songs.getJSONObject(it) }
        }
        return JSONObject().put("id",cached.id).put("name",cached.name).put("snapshot",cached.token).put("trackCount",page.trackCount).put("tracks",JSONArray(page.tracks)).put("nextOffset",page.nextOffset).put("more",page.more)
    }
    fun continuation(token: String): PagedQueueSource {
        val session=current()
        val cached=synchronized(snapshots) { snapshots[token] }?.takeIf { it.session==session.id } ?: throw IOException("歌单快照已失效，请重新进入歌单")
        return PagedQueueSource(session.id,cached.name,0) { offset ->
            ensureSession(session)
            val page=playlistPage(session,cached,offset)
            val tracks=page.getJSONArray("tracks")
            PagedQueueBatch(List(tracks.length()) { trackFromJson(tracks.getJSONObject(it)) },page.getInt("nextOffset"),page.getBoolean("more"))
        }
    }
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
        require(NativeContract.allowedApi(route) && route != "local")
        if(route=="status")return status()
        val session=current();val result=when {
            route.startsWith("liked?offset=") -> {
                val offset=route.substringAfter("offset=").toInt()
                var cached=likedCache
                if(offset==0 || cached?.session!=session.id){
                    val rows=playlistGroup(session,"create") { ownLiked(it,session) }
                    val heart=rows.firstOrNull { ownLiked(it,session) }?:throw IOException("喜欢的音乐歌单暂时无法读取，请稍后重试")
                    cached=playlistSnapshot(session,heart.getLong("id"),requireOrder=true);likedCache=cached
                }
                playlistPage(session,cached,offset,100).put("orderSource","red-heart-playlist")
            }
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
                val created=playlistGroup(session,"create")
                val collected=playlistGroup(session,"collect")
                val output=JSONArray()
                val rows=playlistGroupsInOrder(created,collected,{it.optLong("id")}) { ownLiked(it,session) }
                for(item in rows)output.put(JSONObject().put("id",item.optLong("id")).put("name",item.optString("name")).put("trackCount",item.optInt("trackCount")).put("subscribed",item.optBoolean("subscribed")))
                JSONObject().put("playlists",output).put("orderSource","mobile")
            }
            route.startsWith("tracks?id=") -> {
                val id=route.substringAfter("id=").substringBefore('&').toLong()
                val offset=if(route.contains("&offset="))route.substringAfter("&offset=").toInt() else 0
                var cached=playlistCache
                if(offset==0 || cached?.session!=session.id || cached.id!=id){cached=playlistSnapshot(session,id);playlistCache=cached}
                playlistPage(session,cached,offset)
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
        val item=body.optJSONArray("data")?.optJSONObject(0)?:throw MusicProblem("unavailable","歌曲暂时没有可用音源")
        val url=item.optString("url");if(!url.startsWith("https://")&&!url.startsWith("http://"))throw MusicProblem("unavailable","这首歌受账号或版权权限限制，请尝试下一首")
        return PlayResource(url,!item.isNull("freeTrialInfo"),item.optLong("time"),item.optString("level"))
    }
}
