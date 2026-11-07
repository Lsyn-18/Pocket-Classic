package com.pocketclassic.player

import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class LocalMusicAccess(private val activity: ComponentActivity, private val library: LocalMusicLibrary) {
    private var pending: CompletableDeferred<JSONObject>? = null
    private var category = "device"
    private fun finish(work: () -> JSONObject) = activity.lifecycleScope.launch {
        val task = pending
        try { val result = withContext(Dispatchers.IO) { work() }; task?.complete(result) }
        catch (e: Exception) { task?.completeExceptionally(e) }
        finally { if (pending === task) pending = null }
    }
    private val permission = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> finish { if (granted) library.scan() else library.catalog("未授予音乐权限，可使用文件或文件夹导入") } }
    private val files = activity.registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> finish { if (uris.isEmpty()) library.catalog() else library.importFiles(uris, category) } }
    private val folder = activity.registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri -> finish { if (uri == null) library.catalog() else library.importFolder(uri, category) } }
    suspend fun perform(method: String, targetCategory: String): JSONObject {
        require(targetCategory in setOf("device", "netease"))
        check(pending == null) { "请先完成当前的文件选择" }
        category = targetCategory
        if (method == "localScan" && library.hasPermission()) return withContext(Dispatchers.IO) { library.scan() }
        val task = CompletableDeferred<JSONObject>(); pending = task
        try {
            // NCM providers disagree on MIME (including application/x-netcdf).
            // The native importer validates extensions and the container itself.
            when (method) { "localScan" -> permission.launch(LocalMusicLibrary.permission); "localImport" -> files.launch(arrayOf("*/*")); "localFolder" -> folder.launch(null); else -> error("不支持的本地音乐操作") }
            return task.await()
        } finally { if (pending === task) pending = null }
    }
}
