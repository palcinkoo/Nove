export default function CallLog({ calls }: { calls?: any[] }) {
    const items = calls?.slice(0, 20) || []
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>📞 Hovory</h3>
            {items.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>Žiadne hovory</div>
            ) : (
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {items.map((c: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 6, color: '#888', borderBottom: '1px solid #333', paddingBottom: 4 }}>
                            {c.number || '?'} — {c.duration || 0}s — {new Date(c.date || 0).toLocaleString('sk')}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
