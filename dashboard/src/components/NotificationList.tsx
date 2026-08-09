export default function NotificationList({ notifications }: { notifications?: any[] }) {
    const items = notifications?.slice(0, 20) || []
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>🔔 Notifikácie</h3>
            {items.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>Žiadne notifikácie</div>
            ) : (
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {items.map((n: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 6, color: '#888', borderBottom: '1px solid #333', paddingBottom: 4 }}>
                            <b>{n.package || '?'}</b>: {n.title || ''} — {n.text?.substring(0, 60) || ''}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
