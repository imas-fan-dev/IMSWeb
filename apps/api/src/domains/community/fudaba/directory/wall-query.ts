import type { FudabaWallQuery } from '@/ports/repositories/fudaba';

function invalid(): never {
    throw Object.assign(new Error('墙面查询范围或游标无效'), { status: 400 });
}
export function parseWallQuery(url: string): FudabaWallQuery {
    const params = new URL(url).searchParams;
    const limit = Number(params.get('limit') ?? 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
    let bbox: [number, number, number, number] | undefined;
    if (params.has('bbox')) {
        const raw = params.get('bbox')!.split(',');
        if (raw.some((value) => !value.trim())) invalid();
        const parts = raw.map(Number);
        if (
            parts.length !== 4 ||
            parts.some(
                (value) =>
                    !Number.isFinite(value) || Math.abs(value) > 1_000_000,
            ) ||
            parts[0]! >= parts[2]! ||
            parts[1]! >= parts[3]! ||
            parts[2]! - parts[0]! > 6400 ||
            parts[3]! - parts[1]! > 3600
        )
            invalid();
        bbox = parts as [number, number, number, number];
    }
    const scope = JSON.stringify([
        new URL(url).pathname,
        bbox ?? null,
        params.get('owned'),
        params.get('card'),
    ]);
    let after: FudabaWallQuery['after'];
    if (params.has('cursor')) {
        try {
            const data: unknown = JSON.parse(
                Buffer.from(params.get('cursor')!, 'base64url').toString(
                    'utf8',
                ),
            );
            if (
                !Array.isArray(data) ||
                data.length !== 3 ||
                data[0] !== scope ||
                typeof data[1] !== 'string' ||
                !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(
                    data[1],
                ) ||
                !Number.isFinite(Date.parse(data[1])) ||
                typeof data[2] !== 'string' ||
                !data[2] ||
                data[2].length > 128
            )
                invalid();
            const milliseconds = data[1].replace(/(\.\d{3})\d*Z$/, '$1Z');
            if (
                data[1].startsWith('0000-') ||
                new Date(data[1]).toISOString() !== milliseconds
            )
                invalid();
            after = { pinnedAt: data[1], id: data[2] };
        } catch {
            invalid();
        }
    }
    return {
        limit,
        bbox,
        after,
        scope,
        owned: params.get('owned') === 'true',
        cardId: params.get('card') ?? undefined,
    };
}
export function encodeWallCursor(
    scope: string,
    pinnedAt: string,
    id: string,
): string {
    return Buffer.from(JSON.stringify([scope, pinnedAt, id])).toString(
        'base64url',
    );
}
