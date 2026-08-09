export default function MapView({ location, history }: { location?: any, history?: any[] }) {
    if (!location) return <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>Žiadna poloha</div>
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>📍 Poloha</h3>
            <div style={{ fontSize: 13, color: '#888' }}>
                Lat: {location.latitude?.toFixed(6) ?? '?'}
                {' '}Lng: {location.longitude?.toFixed(6) ?? '?'}
                {' '}Presnosť: {location.accuracy?.toFixed(1) ?? '?'}m
            </div>
            {history && history.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
                    História: {history.length} bodov
                </div>
            )}
        </div>
    )
}
