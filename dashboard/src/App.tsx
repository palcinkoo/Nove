import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from './firebase'
import Login from './pages/Login'
import DevicesList from './pages/DevicesList'
import DeviceDashboard from './pages/DeviceDashboard'
import PairDevice from './pages/PairDevice'

function App() {
    const [user, loading] = useAuthState(auth)

    if (loading) return <div style={{ color: '#fff', background: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>

    return (
        <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={!user ? <Login /> : <Navigate to="/devices" />} />
                    <Route path="/devices" element={user ? <DevicesList /> : <Navigate to="/login" />} />
                    <Route path="/device/:deviceId" element={user ? <DeviceDashboard /> : <Navigate to="/login" />} />
                    <Route path="/pair" element={user ? <PairDevice /> : <Navigate to="/login" />} />
                    <Route path="*" element={<Navigate to={user ? "/devices" : "/login"} />} />
                </Routes>
            </BrowserRouter>
        </div>
    )
}

export default App
