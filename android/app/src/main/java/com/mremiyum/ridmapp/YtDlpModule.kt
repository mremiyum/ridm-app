package com.mremiyum.ridmapp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.provider.DocumentsContract
import android.webkit.MimeTypeMap
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.ffmpeg.FFmpeg
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import java.io.File

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
    
    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "YtDlpBridge"

    @ReactMethod
    fun getSharedLink(promise: Promise) {
        try {
            val activity = getCurrentActivity() 
            if (activity != null) {
                val currentIntent = activity.intent
                if (currentIntent != null && Intent.ACTION_SEND == currentIntent.action && "text/plain" == currentIntent.type) {
                    val sharedText = currentIntent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
                    currentIntent.action = Intent.ACTION_MAIN 
                    promise.resolve(sharedText)
                    return
                }
            }
            promise.resolve("")
        } catch (e: Exception) {
            promise.resolve("")
        }
    }

    override fun onNewIntent(intent: Intent) {
        if (Intent.ACTION_SEND == intent.action && "text/plain" == intent.type) {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            if (sharedText.isNotEmpty()) {
                val params = Arguments.createMap()
                params.putString("url", sharedText)
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("SharedLinkReceived", params)
                
                intent.action = Intent.ACTION_MAIN 
            }
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {}

    @ReactMethod
    fun getDeviceCode(promise: Promise) {
        try {
            val androidId = Settings.Secure.getString(reactApplicationContext.contentResolver, Settings.Secure.ANDROID_ID) ?: "RIDM01"
            val hash = androidId.hashCode()
            val code = Math.abs(hash).toString(36).uppercase().take(6).padStart(6, 'X')
            promise.resolve(code)
        } catch (e: Exception) {
            promise.resolve("RIDM01")
        }
    }

    @ReactMethod
    fun saveSettings(jsonStr: String, downloadPath: String) {
        val prefs = reactApplicationContext.getSharedPreferences("RidmSettings", Context.MODE_PRIVATE)
        prefs.edit().putString("settings_json", jsonStr).apply()
        
        if (downloadPath.isNotEmpty()) {
            try {
                val uri = Uri.parse(downloadPath)
                reactApplicationContext.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            } catch (e: Exception) {}
        }
    }

    @ReactMethod
    fun loadSettings(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("RidmSettings", Context.MODE_PRIVATE)
        promise.resolve(prefs.getString("settings_json", "{}"))
    }
    
    @ReactMethod
    fun openFile(fileUri: String, promise: Promise) {
        try {
            val uri = Uri.parse(fileUri)
            val intent = Intent(Intent.ACTION_VIEW)
            val mimeType = reactApplicationContext.contentResolver.getType(uri) ?: "*/*"
            intent.setDataAndType(uri, mimeType)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_FILE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun shareFile(fileUri: String, promise: Promise) {
        try {
            val uri = Uri.parse(fileUri)
            val intent = Intent(Intent.ACTION_SEND)
            val mimeType = reactApplicationContext.contentResolver.getType(uri) ?: "*/*"
            intent.type = mimeType
            intent.putExtra(Intent.EXTRA_STREAM, uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            
            val chooser = Intent.createChooser(intent, "Paylaş / Kopyala")
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHARE_FILE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun showFileInFolder(fileUri: String, promise: Promise) {
        try {
            val uri = Uri.parse(fileUri)
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            intent.addCategory(Intent.CATEGORY_OPENABLE)
            intent.type = "*/*"
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, uri)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            
            if (intent.resolveActivity(reactApplicationContext.packageManager) != null) {
                reactApplicationContext.startActivity(intent)
            } else {
                val fallbackIntent = Intent(Intent.ACTION_VIEW)
                fallbackIntent.setDataAndType(uri, "*/*")
                fallbackIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                reactApplicationContext.startActivity(fallbackIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHOW_FOLDER_ERROR", e.message)
        }
    }

    @ReactMethod
    fun cancelDownload(id: String, promise: Promise) {
        try {
            val result = YoutubeDL.getInstance().destroyProcessById(id)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun init(promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val appCtx = reactApplicationContext.applicationContext as android.app.Application
                // DÜZELTME: tempDir.deleteRecursively() kodu silindi, yarım indirmeler artık güvende!
                
                YoutubeDL.getInstance().init(appCtx)
                FFmpeg.getInstance().init(appCtx)
                try { YoutubeDL.getInstance().updateYoutubeDL(appCtx, YoutubeDL.UpdateChannel.STABLE) } catch (e: Exception) {}
                promise.resolve("Init OK")
            } catch (e: Exception) {
                promise.reject("INIT_ERROR", "Motor başlatılamadı: ${e.message}")
            }
        }
    }

    private fun applyCookies(cookiesPath: String, request: YoutubeDLRequest, appCtx: android.app.Application) {
        if (cookiesPath.isNotEmpty() && cookiesPath.startsWith("content://")) {
            try {
                val cookiesUri = Uri.parse(cookiesPath)
                val localCookiesFile = File(appCtx.cacheDir, "ridm_cookies.txt")
                appCtx.contentResolver.openInputStream(cookiesUri)?.use { input ->
                    localCookiesFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                request.addOption("--cookies", localCookiesFile.absolutePath)
            } catch (e: Exception) {}
        }
    }

    @ReactMethod
    fun analyze(url: String, cookiesPath: String, promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val appCtx = reactApplicationContext.applicationContext as android.app.Application
                val request = YoutubeDLRequest(url)
                request.addOption("-J")
                request.addOption("--flat-playlist") 
                request.addOption("--no-check-certificate")
                request.addOption("--socket-timeout", "10") 
                
                applyCookies(cookiesPath, request, appCtx) 
                
                val response = YoutubeDL.getInstance().execute(request, null, null)
                promise.resolve(response.out)
            } catch (e: Exception) {
                promise.reject("ANALYZE_ERROR", e.cause?.message ?: e.message ?: "Bilinmeyen yt-dlp Hatası")
            }
        }
    }

    private fun moveCompletedFiles(id: String, compDir: File, destTreeUri: Uri, smartFolder: String, appCtx: android.app.Application): String {
        var lastSavedUri = ""
        val files = compDir.listFiles() ?: return ""
        if (files.isEmpty()) return ""
        var docTree = DocumentFile.fromTreeUri(appCtx, destTreeUri) ?: return ""
        if (smartFolder.isNotEmpty()) {
            docTree = docTree.findFile(smartFolder) ?: docTree.createDirectory(smartFolder) ?: return ""
        }
        for (file in files) {
            if (file.isFile && !file.name.endsWith(".part") && !file.name.endsWith(".ytdl")) {
                val mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension) ?: "application/octet-stream"
                val newFile = docTree.createFile(mimeType, file.name)
                if (newFile != null) {
                    try {
                        appCtx.contentResolver.openOutputStream(newFile.uri)?.use { outStream ->
                            file.inputStream().use { inStream -> inStream.copyTo(outStream) }
                        }
                        file.delete()
                        lastSavedUri = newFile.uri.toString() 
                        
                        val params = Arguments.createMap()
                        params.putString("parentId", id)
                        params.putString("fileName", file.name)
                        params.putString("fileUri", lastSavedUri)
                        reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("FileFinished", params)
                        
                    } catch (e: Exception) {}
                }
            }
        }
        return lastSavedUri
    }

    // DÜZELTME: isBulk parametresi eklendi
    @ReactMethod
    fun downloadMedia(id: String, url: String, formatId: String, subId: String, playlistItems: String, downloadDir: String, smartFolder: String, cookiesPath: String, isBulk: Boolean, promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            var isDownloading = true
            var finalUri = ""
            val appCtx = reactApplicationContext.applicationContext as android.app.Application
            
            val tempDir = File(appCtx.getExternalFilesDir(null), "ridm_downloading")
            val compDir = File(appCtx.getExternalFilesDir(null), "ridm_completed")
            tempDir.mkdirs()
            compDir.mkdirs()
            val destTreeUri = Uri.parse(downloadDir)

            val watcherJob = launch(Dispatchers.IO) {
                while (isDownloading) {
                    val uri = moveCompletedFiles(id, compDir, destTreeUri, smartFolder, appCtx)
                    if (uri.isNotEmpty()) finalUri = uri
                    delay(2000)
                }
                val uri = moveCompletedFiles(id, compDir, destTreeUri, smartFolder, appCtx)
                if (uri.isNotEmpty()) finalUri = uri
            }

            try {
                val request = YoutubeDLRequest(url)
                val isAudioOnly = formatId.startsWith("bestaudio") || formatId == "mp3" || formatId == "m4a" || formatId == "opus"

                request.addOption("-i") 
                request.addOption("-c") 
                request.addOption("--no-overwrites") 
                
                request.addOption("--paths", "temp:${tempDir.absolutePath}") 
                request.addOption("--paths", compDir.absolutePath) 
                request.addOption("-o", "%(title)s.%(ext)s")
                request.addOption("--no-check-certificate")
                // DÜZELTME: Chrome tarayıcı algısı SADECE Instagram linklerinde devreye girer
                if (url.contains("instagram.com", ignoreCase = true)) {
                    request.addOption("--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    request.addOption("--referer", "https://www.instagram.com/")
                }
                // DÜZELTME: Arşiv dosyası SADECE toplu indirmelerde devreye girer
                if (isBulk) {
                    val archiveFile = File(appCtx.getExternalFilesDir(null), "ridm_archive.txt")
                    request.addOption("--download-archive", archiveFile.absolutePath)
                }
                
                applyCookies(cookiesPath, request, appCtx)

                if (isAudioOnly) {
                    request.addOption("-x") 
                    
                    when (formatId) {
                        "mp3" -> {
                            request.addOption("-f", "bestaudio/best")
                            request.addOption("--audio-format", "mp3")
                            // MP3 için YouTube'da orijinal stream olmadığından dönüştürme yapılır, 
                            // ancak audio-quality 0 silindiği için dosya boyutu gereksiz şişmez, orijinal kbps korunur.
                        }
                        "m4a" -> {
                            // YouTube'daki orijinal M4A akışını çeker. FFmpeg sesi dönüştürmez, sadece kopyalar.
                            request.addOption("-f", "bestaudio[ext=m4a]/bestaudio")
                            request.addOption("--audio-format", "m4a")
                        }
                        "opus" -> {
                            // YouTube'daki orijinal Opus akışını çeker.
                            request.addOption("-f", "bestaudio[ext=webm]/bestaudio")
                            request.addOption("--audio-format", "opus")
                        }
                        else -> {
                            request.addOption("-f", "bestaudio/best")
                        }
                    }
                    
                    // M4A için Kapak fotoğrafı (Thumbnail), Metadata ve Altyazıların bozulmadan gömülmesi için:
                    request.addOption("--embed-metadata")
                    request.addOption("--embed-thumbnail")
                } else {
                    request.addOption("--merge-output-format", "mkv") 
                    
                    if (formatId == "2160p" || formatId.contains("2160")) {
                        request.addOption("-f", "bestvideo[height=2160]+bestaudio")
                    } else if (formatId == "1080p" || formatId.contains("1080")) {
                        request.addOption("-f", "bestvideo[height=1080]+bestaudio")
                    } else {
                        val finalFormat = when (formatId) {
                            "b1", "best" -> "bestvideo+bestaudio/best"
                            else -> "$formatId+bestaudio" 
                        }
                        request.addOption("-f", finalFormat)
                    }
                }
                
                // --- ALTYAZI İŞLEMLERİ BLOĞU ---
                if (subId != "none") {
                    request.addOption("--write-subs")
                    request.addOption("--write-auto-subs")
                    if (subId != "all") request.addOption("--sub-langs", subId)

                    if (formatId == "mp3" || formatId == "opus") {
                        // MP3 ve Opus için gömme (embed) yapmıyoruz. 
                        // Sadece altyazıyı indirip LRC (şarkı sözü) formatına dönüştürüyoruz.
                        // yt-dlp bu LRC dosyasını ses dosyasıyla aynı isimde klasöre bırakacak.
                        request.addOption("--convert-subs", "lrc")
                    } else {
                        // M4A ve Videolar için altyazıyı doğrudan dosyanın içine gömüyoruz.
                        request.addOption("--embed-subs")
                        request.addOption("--compat-options", "no-keep-subs") // Gömüldükten sonra dışarıdaki srt'yi sil
                        request.addOption("--sub-format", "srt/best")
                        request.addOption("--convert-subs", "srt")
                    }
                }

                if (playlistItems != "all" && playlistItems.isNotBlank()) {
                    request.addOption("--playlist-items", playlistItems)
                }

                YoutubeDL.getInstance().execute(request, id) { progress, etaInSeconds, line ->
                    val params = Arguments.createMap()
                    params.putString("id", id)
                    params.putDouble("progress", progress.toDouble())
                    params.putString("line", line ?: "")
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("DownloadProgress", params)
                }

                promise.resolve(finalUri.ifEmpty { "DOWNLOAD_OK_WITH_WARNINGS" })
                
            } catch (e: Exception) {
                val errorString = e.cause?.message ?: e.message ?: "İndirme Hatası"
                
                if (errorString.contains("cancelled", ignoreCase = true) || errorString.contains("interrupted", ignoreCase = true) || errorString.contains("destroy", ignoreCase = true)) {
                    promise.resolve("DOWNLOAD_CANCELLED")
                } else if (errorString.contains("Encoder not found") || errorString.contains("impersonate target is available") || errorString.contains("WARNING")) {
                    promise.resolve(finalUri.ifEmpty { "DOWNLOAD_OK_WITH_WARNINGS" })
                } else {
                    promise.reject("DOWNLOAD_ERROR", errorString)
                }
            } finally {
                isDownloading = false 
                watcherJob.join() 
            }
        }
    }
}
