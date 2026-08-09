export default function UsageChart({ usage }: { usage?: any[] }) {
    const items = usage?.slice(0, 10) || []
    return (
        <div style={{ padding: 20, background: '#1a1a1a', borderRadius: 10 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>📊 Používanie aplikácií</h3>
            {items.length === 0 ? (
                <div style={{ color: '#666', fontSize: 12 }}>Žiadne dáta</div>
            ) : (
                items.map((u: any, i: number) => (
                    <div key={i} style={{ fontSize: 12, marginBottom: 6, color: '#888' }}>
                        {u.packageName}: {Math.round((u.totalTime || 0) / 1000)}s
                    </div>
                ))
            )}
        </div>
    )
}
