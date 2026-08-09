export default function HistoryBrowser({ history }: { history?: any[] }) {
    const items = history?.slice(0, 20) || []
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>🌐 História prehliadača</h3>
            {items.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>Žiadna história</div>
            ) : (
                <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {items.map((h: any, i: number) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 6, color: '#888', borderBottom: '1px solid #333', paddingBottom: 4, wordBreak: 'break-all' }}>
                            <a href={h.url || '#'} style={{ color: '#4f46e5', textDecoration: 'none' }} target="_blank" rel="noreferrer">
                                {h.url?.substring(0, 80) || '?'}
                            </a>
                            {' '}{h.packageName || ''}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
