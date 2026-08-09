// FIX: Use in-memory Map instead of sessionStorage for decrypt keys (XSS prevention)
const keyStore = new Map<string, string>()

export async function decryptBlob(base64: string, keyHex: string): Promise<string> {
    try {
        const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        if (combined.length <= 12) return '[encrypted]'
        const iv = toArrayBuffer(combined.slice(0, 12))
        const data = toArrayBuffer(combined.slice(12))
        const cryptoKey = await crypto.subtle.importKey(
            'raw', toArrayBuffer(hexToBytes(keyHex)),
            { name: 'AES-GCM' }, false, ['decrypt']
        )
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data)
        return new TextDecoder().decode(decrypted)
    } catch {
        return '[encrypted]'
    }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function hexToBytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
    }
    return arr
}

export async function decryptBatch(batch: any[], keyHex: string): Promise<any[]> {
    return Promise.all(batch.map(async (item) => {
        const clone = { ...item }
        try {
            if (clone.encrypted && typeof clone.encrypted === 'string' && clone.encrypted.length > 20) {
                const decrypted = await decryptBlob(clone.encrypted, keyHex)
                if (decrypted !== '[encrypted]') {
                    const parsed = JSON.parse(decrypted)
                    Object.assign(clone, parsed)
                }
            }
        } catch {
            // keep as-is
        }
        return clone
    }))
}

export function storeDecryptKey(deviceId: string, keyHex: string): void {
    keyStore.set(deviceId, keyHex)
}

export function getDecryptKey(deviceId: string): string | null {
    return keyStore.get(deviceId) ?? null
}

export function clearDecryptKey(deviceId: string): void {
    keyStore.delete(deviceId)
}
