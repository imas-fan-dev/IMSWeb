export function constantTimeEqual(left: unknown, right: unknown): boolean {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const a = new TextEncoder().encode(left);
    const b = new TextEncoder().encode(right);
    let mismatch = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        mismatch |= (a[index] || 0) ^ (b[index] || 0);
    }
    return mismatch === 0;
}
