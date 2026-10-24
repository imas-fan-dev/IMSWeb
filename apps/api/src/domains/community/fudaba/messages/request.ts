import type {
    FudabaMessageCreateInput,
    FudabaMessageEditInput,
    FudabaMessagePlacementInput,
    FudabaMessageModerationInput,
} from '@imsweb/contracts/fudaba/messages';
import { createHash } from 'node:crypto';
import type { FudabaMixedWallQuery } from '@/ports/repositories/fudaba-messages';

export function messageScope(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function messageListQuery(url: string, scope: unknown) {
    const params = new URL(url).searchParams;
    const limit = Number(params.get('limit') ?? 50);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw Object.assign(new Error('limit 须为 1–100'), { status: 400 });
    return {
        limit,
        cursor: params.get('cursor') ?? undefined,
        scope: messageScope([
            scope,
            params.get('office'),
            params.get('status'),
            limit,
        ]),
    };
}
export function mixedWallQuery(
    url: string,
    slug: string
): FudabaMixedWallQuery {
    const params = new URL(url).searchParams;
    const { limit, cursor } = messageListQuery(url, slug);
    let bbox: FudabaMixedWallQuery['bbox'];
    if (params.has('bbox')) {
        const values = params.get('bbox')!.split(',').map(Number);
        if (
            values.length !== 4 ||
            values.some(
                (value) =>
                    !Number.isFinite(value) || Math.abs(value) > 1_000_000
            ) ||
            values[0] >= values[2] ||
            values[1] >= values[3] ||
            values[2] - values[0] > 6400 ||
            values[3] - values[1] > 3600
        )
            throw Object.assign(new Error('墙面区域无效'), { status: 400 });
        bbox = values as [number, number, number, number];
    }
    const item = params.get('item') ?? undefined;
    return {
        limit,
        cursor,
        bbox,
        item,
        scope: messageScope([slug, bbox ?? null, item ?? null, limit]),
    };
}

export function parseFudabaMessageCreate(
    input: FudabaMessageCreateInput
): FudabaMessageCreateInput {
    return {
        content: input.content.trim(),
        color: input.color,
        ...(input.height === undefined ? {} : { height: input.height }),
        ...(input.center
            ? { center: { x: input.center.x, y: input.center.y } }
            : {}),
    };
}
export function parseFudabaMessageEdit(
    input: FudabaMessageEditInput
): FudabaMessageEditInput {
    return {
        ...parseFudabaMessageCreate(input),
        expectedRevision: input.expectedRevision,
    };
}
export function parseFudabaMessagePlacement(
    input: FudabaMessagePlacementInput
): FudabaMessagePlacementInput {
    return {
        layoutVersion: input.layoutVersion,
        x: input.x,
        y: input.y,
        rotation: input.rotation,
        zIndex: input.zIndex,
        expectedRevision: input.expectedRevision,
    };
}
export function parseFudabaMessageModeration(
    input: FudabaMessageModerationInput
): FudabaMessageModerationInput {
    return { hidden: input.hidden, expectedRevision: input.expectedRevision };
}
