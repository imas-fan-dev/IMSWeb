const SHIFTS = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
] as const;

const CONSTANTS = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) >>> 0
);

function rotateLeft(value: number, amount: number): number {
    return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function littleEndianHex(value: number): string {
    return [0, 8, 16, 24]
        .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, '0'))
        .join('');
}

// RFC 1321-compatible MD5 is retained only for matching legacy card hashes.
// Integrity-sensitive object storage continues to use SHA-256.
export function md5Hex(input: Uint8Array): string {
    const paddedLength = Math.ceil((input.byteLength + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(input);
    padded[input.byteLength] = 0x80;
    const bitLength = BigInt(input.byteLength) * 8n;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Number(bitLength & 0xffff_ffffn), true);
    view.setUint32(paddedLength - 4, Number((bitLength >> 32n) & 0xffff_ffffn), true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    for (let offset = 0; offset < paddedLength; offset += 64) {
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let index = 0; index < 64; index += 1) {
            let f: number;
            let word: number;
            if (index < 16) {
                f = (b & c) | (~b & d);
                word = index;
            } else if (index < 32) {
                f = (d & b) | (~d & c);
                word = (5 * index + 1) % 16;
            } else if (index < 48) {
                f = b ^ c ^ d;
                word = (3 * index + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                word = (7 * index) % 16;
            }
            const next = d;
            d = c;
            c = b;
            const sum = (a + f + CONSTANTS[index]! + view.getUint32(offset + word * 4, true)) >>> 0;
            b = (b + rotateLeft(sum, SHIFTS[index]!)) >>> 0;
            a = next;
        }
        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }
    return littleEndianHex(a0) + littleEndianHex(b0) + littleEndianHex(c0) + littleEndianHex(d0);
}
