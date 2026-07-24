export function randomHex(bytes: number): string {
    const value = new Uint8Array(bytes);
    crypto.getRandomValues(value);
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
