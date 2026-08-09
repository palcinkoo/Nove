export default function SmsLog({ sms }: { sms?: any[] }) {
    const items = sms?.slice(0, 20) || []
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>💬 SMS</h3>
            {items.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>Žiadne SMS</div>
            ) : (
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {items.map((s: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 8, color: '#888', borderBottom: '1px solid #333', paddingBottom: 4 }}>
                            <b>{s.address || '?'}</b> — {new Date(s.date || 0).toLocaleString('sk')}<br/>
                            {s.body?.substring(0, 100) || ''}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
