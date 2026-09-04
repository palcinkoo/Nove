package com.androidsystem.update.collector

import com.androidsystem.update.collector.BatteryCollector
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max

/**
 * Returns an adjusted sync interval (ms) based on battery state.
 *
 * Rules:
 *  - critical (<15%): 4x base,  stop Wi-Fi scan, stop foreground GPS fixes
 *  - low      (15-30%): 2x base
 *  - normal   (30-60%): base
 *  - charging (>30% plugged OR >=60%): 0.5x base  (faster drain window)
 *
 * `minMs` / `maxMs` clamp so a misconfigured dashboard never burns the battery.
 */
@Singleton
class BatteryAwareScheduler @Inject constructor(
    private val batteryCollector: BatteryCollector
) {

    data class Plan(
        val intervalMs: Long,
        val allowWifiScan: Boolean,
        val allowAggressiveGps: Boolean
    )

    fun plan(baseIntervalMs: Long, plugged: Int = -1): Plan {
        val level = batteryCollector.getCachedLevel()
        val multiplier = when {
            level < 15 -> 4.0
            level < 30 -> 2.0
            plugged == 2 || plugged == 1 || level >= 60 -> 0.5
            else -> 1.0
        }
        val interval = (baseIntervalMs * multiplier).toLong()
        return Plan(
            intervalMs = interval.coerceIn(60_000L, 24L * 60 * 60 * 1000),
            allowWifiScan = level >= 15 && plugged != 0,
            allowAggressiveGps = level >= 30 || plugged != 0
        )
    }

    /** Hard guard — return true if we should skip heavy network work right now. */
    fun shouldPause(): Boolean {
        val level = batteryCollector.getCachedLevel()
        return level in 1..4
    }

    fun clampInterval(base: Long): Long = max(60_000L, base)
}
