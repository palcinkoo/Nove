import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth, db } from '../firebase'
import { ref, onValue } from 'firebase/database'

interface Device {
    id: string
    lastSeen: number
    battery: number
    status: string
    interval: number
}

export default function DevicesList() {
    const [user] = useAuthState(auth)
    const [devices, setDevices] = useState<Device[]>([])
    const nav = useNavigate()

    useEffect(() => {
        if (!user) return
        const r = ref(db, `users/${user.uid}/devices`)
        return onValue(r, snap => {
            const val = snap.val() || {}
            setDevices(Object.keys(val).map(id => ({ id, ...val[id] })))
        })
    }, [user])

    const isOnline = (d: Device) => d.lastSeen && Date.now() - d.lastSeen < 120_000

    const btnStyle: React.CSSProperties = {
        background: '#2a2a2a', color: '#fff', border: '1px solid #444',
        borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13
    }

    return (
        <div style={{ maxWidth: 900, margin: '24px auto', fontFamily: 'sans-serif', color: '#fff', padding: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2>ERAFOX — Zariadenia ({devices.length})</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => nav('/pair')} style={btnStyle}>+ Spárovať</button>
                    <button onClick={() => signOut(auth)} style={{ ...btnStyle, color: '#ef4444' }}>Odhlásiť</button>
                </div>
            </div>
            {devices.length === 0 && (
                <div style={{ color: '#888', padding: 40, textAlign: 'center', border: '1px dashed #333', borderRadius: 12 }}>
                    Žiadne zariadenia. Spárujte prvé zariadenie.
                </div>
            )}
            {devices.map(d => (
                <div
                    key={d.id}
                    onClick={() => nav(`/device/${d.id}`)}
                    style={{
                        border: '1px solid #333', borderRadius: 10, padding: 20,
                        marginBottom: 12, cursor: 'pointer', background: '#1a1a1a',
                        transition: 'border-color 0.2s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#4f46e5')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#333')}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b style={{ fontSize: 16 }}>{d.id}</b>
                        <span style={{ color: isOnline(d) ? '#22c55e' : '#ef4444', fontSize: 13 }}>
                            ● {isOnline(d) ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    {/* FIX: interval ?? 60 */}
                    <div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>
                        Interval: {d.interval ?? 60}min · Batéria: {d.battery ?? '?'}%
                    </div>
                    <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>
                        {d.lastSeen ? new Date(d.lastSeen).toLocaleString('sk') : 'Nikdy'}
                    </div>
                </div>
            ))}
        </div>
    )
}
