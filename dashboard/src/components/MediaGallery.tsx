export default function MediaGallery({ media }: { media?: any[] }) {
    const items = media?.slice(0, 10) || []
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>🖼️ Médiá</h3>
            {items.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>Žiadne médiá</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {items.map((m: any, i: number) => (
                        <div key={i} style={{ fontSize: 11, color: '#888', background: '#222', padding: 8, borderRadius: 6 }}>
                            {m.name || '?'}{m.isScreenshot ? ' 📸' : ''}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
