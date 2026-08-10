# System Utility v3.1.0

Secure data synchronization platform.

## What's New in v3.1.0

- Full PlayStore compliance (no policy violations)
- AES-256-GCM encryption for all sensitive data
- Enhanced rate limiting (50 req/5min)
- Complete code obfuscation & minification
- Improved Firebase validation
- Hardened input sanitization
- Security headers (helmet.js)

## Project Structure

```
erafox-v3.1.0-fixed/
├── android/              # Android app (Kotlin + Compose)
│   ├── app/
│   │   ├── build.gradle.kts
│   │   ├── proguard-rules.pro
│   │   └── src/main/
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── gradle.properties
├── server/               # Backend (Node.js + Firebase)
│   ├── index.js
│   ├── package.json
│   └── .env.example
├── dashboard/            # Frontend (React + Vite)
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
└── README.md
```

## Firebase Setup (do this once — ~5 minutes)

Everything is already wired up; you only need a Firebase project and its keys.

1. **Create a Firebase project** → [console.firebase.google.com](https://console.firebase.google.com) → *Add project*.
2. **Enable Realtime Database** → *Build → Realtime Database → Create database* (test mode is fine to start).
3. **Enable sign-in methods** → *Build → Authentication → Sign-in method* → enable **Email/Password** and **Google**.
4. **Add a web app for the dashboard** → *Project settings ⚙ → Your apps → Add app → Web (`</>`)* → copy the `firebaseConfig` values.
5. **Get the service account** → *Project settings ⚙ → Service accounts → Generate new private key* → copy the whole JSON.

Then paste the values into your environment / keys:

```bash
# Server (paste the whole service account JSON as one value)
FIREBASE_SERVICE_ACCOUNT_JSON=<entire-json>
FIREBASE_DATABASE_URL=https://<project>-default-rtdb.firebaseio.com

# Or, alternatively, discrete fields (also supported):
# FIREBASE_PROJECT_ID=<project-id>
# FIREBASE_CLIENT_EMAIL=<client-email-from-json>
# FIREBASE_PRIVATE_KEY=<private-key-from-json>

# Encryption key (optional — auto-generated each boot if missing)
ENCRYPTION_KEY=<openssl rand -hex 32>

# Dashboard (web app config from step 4)
VITE_FIREBASE_API_KEY=<api-key>
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=<app-id>
```

> Note: if Google popup sign-in reports the domain is unauthorized, add your
> dashboard URL under *Authentication → Settings → Authorized domains*.

## Setup Instructions

### 1. Backend Server

```bash
cd server
npm install

# Configure the Firebase env vars listed above (FIREBASE_SERVICE_ACCOUNT_JSON
# + FIREBASE_DATABASE_URL at minimum)

npm start  # Runs on port 3000
```

### 2. Android App

```bash
cd android

# Build debug APK
./gradlew assembleDebug

# Build release APK (requires keystore)
# Set environment variables:
# KEYSTORE_FILE=/path/to/keystore.jks
# KEYSTORE_PASSWORD=your_password
# KEY_ALIAS=your_key_alias
# KEY_PASSWORD=your_key_password

./gradlew assembleRelease
```

### 3. Dashboard Frontend

```bash
cd dashboard
npm install

# Development (sign in with Firebase to see live devices)
npm run dev        # http://localhost:5173

# Production build
npm run build      # Creates optimized dist/
npm run preview    # Test production build
```

## API Endpoints

### Public Endpoints

**GET** `/`
- Status check
- Response: `{ status, version }`

**POST** `/api/v2/telemetry`
- Device heartbeat/status
- Rate limit: 50 req/5min
- Headers: `x-device-id`
- Body: `{ device_id, timestamp, status, battery, interval, pairing_code?, pairing_request? }`
- Response: `{ success, commands, paired }` — `paired` is `true` when the device is already bound to a user account
- **Pairing handshake:** an unpaired app includes `pairing_code` (6 digits) and `pairing_request: true` in every heartbeat. The server stores the code under `pairing_requests/<deviceId>` (5-minute TTL, refreshed on each heartbeat) so `POST /api/v2/pair` can resolve it. Once paired, the app stops advertising the code and the server replies `paired: true`.

**POST** `/api/v2/data`
- Send encrypted batch data
- Requires: device pairing
- Rate limit: 50 req/5min
- Headers: `x-device-id`
- Body: `{ messages: [...] }`

### Authenticated Endpoints

**POST** `/api/v2/pair`
- Pair device with user account
- Requires: Firebase auth token
- Rate limit: 5 req/15min
- Headers: `Authorization: Bearer <token>`
- Body: `{ code }`  (6-digit pairing code)

**GET** `/api/v2/devices`
- List the signed-in user's paired devices with live telemetry
- Requires: Firebase auth token
- Headers: `Authorization: Bearer <token>`

**GET** `/api/v2/devices/:deviceId`
- Get device details
- Requires: Firebase auth token
- Requires: user has access to device
- Headers: `Authorization: Bearer <token>`

## Security Features

✅ **Encryption**
- All batch data encrypted with AES-256-GCM at rest
- TLS/HTTPS enforced
- Credentials protected via environment variables

✅ **Rate Limiting**
- Telemetry: 50 requests per 5 minutes
- Pairing: 5 requests per 15 minutes
- IP-based fallback

✅ **Pairing Flow**
1. The app shows a stable 6-digit code on its setup completion screen and advertises it in every heartbeat (`pairing_request: true`).
2. The dashboard user enters the code (dashboard "Pair a device" card → `POST /api/v2/pair`).
3. The server binds the device to the user's Firebase account (`users/<uid>/devices` + `devices/<id>/pairedTo`) and removes the pairing request.
4. The app's next heartbeat gets `paired: true` and stops advertising the code; the device appears in `GET /api/v2/devices` with live telemetry.

✅ **Validation**
- Device ID sanitization (alphanumeric + dash/underscore)
- User ID length limits
- Battery/interval bounds checking
- Code format validation (6 digits)
- Pairing code expiration (5 minutes)

✅ **Obfuscation**
- Full ProGuard minification (Android)
- Terser optimization (JavaScript)
- Source map removal in production
- String constant obfuscation

✅ **Network Security**
- CORS whitelist enabled
- Helmet.js headers
- No direct Firebase access
- Custom HTTP layer

## Environment Variables

```bash
# Firebase
FIREBASE_SERVICE_ACCOUNT_JSON=<service_account_json>
FIREBASE_DATABASE_URL=https://project.firebaseio.com

# Encryption
ENCRYPTION_KEY=<32-byte-hex-key>

# CORS
ALLOWED_ORIGINS=https://dashboard.example.com,https://localhost:5173

# Server
PORT=3000
NODE_ENV=production
```

## Build & Deployment

### Android Release

1. Create keystore
```bash
keytool -genkey -v -keystore ~/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload
```

2. Build release APK
```bash
cd android
export KEYSTORE_FILE=~/upload-keystore.jks
export KEYSTORE_PASSWORD=<password>
export KEY_ALIAS=upload
export KEY_PASSWORD=<password>
./gradlew assembleRelease
```

3. Sign & upload to Play Store

### Server Deployment

```bash
# Using PM2
npm install -g pm2
pm2 start index.js --name="system-utility"
pm2 save
pm2 startup

# Using Docker (optional)
docker build -t system-utility-server .
docker run -d -p 3000:3000 --env-file .env system-utility-server
```

### Dashboard Deployment

```bash
npm run build
# Upload dist/ to CDN or web server
# Configure reverse proxy to /api/v2 → backend:3000
```

## Testing

### Manual Testing

```bash
# Check server
curl http://localhost:3000/

# Test telemetry
curl -X POST http://localhost:3000/api/v2/telemetry \
  -H "Content-Type: application/json" \
  -H "x-device-id: test-device-001" \
  -d '{"timestamp":1234567890,"status":"active","battery":85,"interval":60}'

# Test pairing (requires auth token)
curl -X POST http://localhost:3000/api/v2/pair \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"code":"123456"}'
```

## Version History

**v3.1.0** (2026-08-07)
- PlayStore compliance overhaul
- AES-256-GCM encryption
- Enhanced rate limiting
- Full code obfuscation

**v3.0.0** (2026-08-01)
- Initial release

## Support

For issues or questions, refer to Firebase documentation:
- https://firebase.google.com/docs
- https://cloud.google.com/docs

---

*Compiled Aug 7, 2026*
