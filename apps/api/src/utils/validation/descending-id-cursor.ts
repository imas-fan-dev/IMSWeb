const DESCENDING_ID_CURSOR_VERSION = 1;
const MAX_SIGNED_BIGINT = '9223372036854775807';
const MAX_CURSOR_LENGTH = 512;

export interface DescendingIdCursor {
    snapshotId: string;
    afterId: string;
}

function isDecimalId(value: unknown): value is string {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return false;
    return value.length < MAX_SIGNED_BIGINT.length ||
        (value.length === MAX_SIGNED_BIGINT.length && value <= MAX_SIGNED_BIGINT);
}

function compareDecimalIds(left: string, right: string): number {
    if (left.length !== right.length) return left.length < right.length ? -1 : 1;
    return left === right ? 0 : left < right ? -1 : 1;
}

export function descendingIdAsDecimal(value: unknown): string | null {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
    }
    return isDecimalId(value) ? value : null;
}

export function encodeDescendingIdCursor(cursor: DescendingIdCursor): string {
    if (!isDecimalId(cursor.snapshotId) || !isDecimalId(cursor.afterId) ||
        compareDecimalIds(cursor.afterId, cursor.snapshotId) > 0) {
        throw new Error('Invalid descending ID cursor state');
    }
    return Buffer.from(JSON.stringify({
        version: DESCENDING_ID_CURSOR_VERSION,
        snapshotId: cursor.snapshotId,
        afterId: cursor.afterId
    }), 'utf8').toString('base64url');
}

export function decodeDescendingIdCursor(value: string): DescendingIdCursor | null {
    if (!value || value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    try {
        const decoded = Buffer.from(value, 'base64url');
        if (decoded.toString('base64url') !== value) return null;
        const parsed = JSON.parse(decoded.toString('utf8')) as Record<string, unknown>;
        if (
            parsed.version !== DESCENDING_ID_CURSOR_VERSION ||
            !isDecimalId(parsed.snapshotId) ||
            !isDecimalId(parsed.afterId) ||
            compareDecimalIds(parsed.afterId, parsed.snapshotId) > 0
        ) {
            return null;
        }
        return { snapshotId: parsed.snapshotId, afterId: parsed.afterId };
    } catch {
        return null;
    }
}
