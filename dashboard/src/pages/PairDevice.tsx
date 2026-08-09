import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '../firebase'

export default function PairDevice() {
    const [code, setCode] = useState('')
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
    const [loading, setLoading] = useState(false)
    const [user] = useAuthState(auth)
    const nav = useNavigate()

    const pair = async () => {
        if (!user || code.length !== 6) {
            setMsg({ text: 'Zadaj 6-miestny kód', ok: false })
            return
        }
        setLoading(true)
        try {
            const token = await user.getIdToken()
            const res = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/v2/pair`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code })
            })
            const data = await res.json()
            if (res.ok) {
                // FIX: redirect with deviceId from response
                setMsg({ text: `Zariadenie ${data.deviceId} spárované! Zadaj decrypt key v dashboarde.`, ok: true })
                setTimeout(() => nav(`/device/${data.deviceId}`), 2000)
            } else {
                setMsg({ text: data.error || 'Chyba párovania', ok: false })
            }
        } catch {
            setMsg({ text: 'Sieťová chyba', ok: false })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif', color: '#fff' }}>
            <button onClick={() => nav('/devices')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', marginBottom: 24 }}>
                ← Späť
            </button>
            <h2 style={{ marginBottom: 8 }}>Spárovať zariadenie</h2>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>
                Zadaj 6-miestny kód zobrazený na zariadení po inštalácii.
            </p>
            <input
                placeholder="123456"
                value={code}
                maxLength={6}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                style={{
                    width: '100%', padding: '12px 14px', marginBottom: 12,
                    boxSizing: 'border-box', background: '#1a1a1a',
                    border: '1px solid #333', borderRadius: 8,
                    color: '#fff', fontSize: 24, textAlign: 'center',
                    letterSpacing: 8
                }}
                onKeyDown={e => e.key === 'Enter' && pair()}
            />
            {msg && (
                <p style={{ color: msg.ok ? '#22c55e' : '#ef4444', fontSize: 13, marginBottom: 12 }}>
                    {msg.text}
                </p>
            )}
            <button
                onClick={pair}
                disabled={loading || code.length !== 6}
                style={{
                    width: '100%', padding: 12,
                    background: code.length === 6 ? '#4f46e5' : '#333',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 16, cursor: code.length === 6 ? 'pointer' : 'default'
                }}
            >
                {loading ? 'Párujem...' : 'Spárovať'}
            </button>
        </div>
    )
}
