import type { Context } from 'hono';
import type { FudabaErrorResponse } from '@imsweb/contracts/fudaba';
import type { AppEnvironment } from '@/app';

export async function handleRejectLegacyFudabaPlacement(
    c: Context<AppEnvironment>,
): Promise<Response> {
    return c.json(
        {
            success: false,
            code: 'FUDABA_WALL_LAYOUT_CONFLICT',
            message: '名片墙布局已升级，请更新客户端后重新载入。',
        } satisfies FudabaErrorResponse,
        409,
    );
}
