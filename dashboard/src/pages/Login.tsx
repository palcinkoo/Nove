import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleLogin = async () => {
        setError('')
        setLoading(true)
        try {
            await signInWithEmailAndPassword(auth, email, password)
        } catch (e: any) {
            setError(e.message || 'Login failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ maxWidth: 360, margin: '120px auto', fontFamily: 'sans-serif', color: '#fff' }}>
            <h2 style={{ textAlign: 'center', marginBottom: 24 }}>ERAFOX Dashboard</h2>
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', padding: 12, marginBottom: 12, background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', boxSizing: 'border-box' }}
            />
            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', padding: 12, marginBottom: 12, background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', boxSizing: 'border-box' }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <button
                onClick={handleLogin}
                disabled={loading}
                style={{ width: '100%', padding: 12, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer' }}
            >
                {loading ? 'Loading...' : 'Login'}
            </button>
        </div>
    )
}
