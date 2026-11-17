import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { validFudabaOfficeId } from '@/domains/community/fudaba/contracts/office';
import { parseFudabaOfficeUpdate } from '@/domains/community/fudaba/offices/request';
import { parseFudabaLocationReviewQuery } from '@/domains/community/fudaba/moderation/request';
import { fudabaAdminOfficeReviewView } from '@/domains/community/fudaba/moderation/response';
import {
    fudabaRepository,
    getClientAddress,
    services,
} from '@/middleware/hono-context';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleListAdminFudabaOffices(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const rows = await fudabaRepository(c).listOfficeReviews(
        parseFudabaLocationReviewQuery(c.req.url),
    );
    return c.json({ items: rows.map(fudabaAdminOfficeReviewView) });
}

export async function handleGetAdminFudabaOffice(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const id = c.req.param('officeId') || '';
    const item = validFudabaOfficeId(id)
        ? await fudabaRepository(c).findOfficeReview(id)
        : null;
    return item
        ? c.json({ item: fudabaAdminOfficeReviewView(item) })
        : c.json({ success: false, code: 'FUDABA_OFFICE_NOT_FOUND' }, 404);
}

export async function handleUpdateAdminFudabaOffice(
    c: Context<AppEnvironment>,
): Promise<Response> {
    try {
        const id = c.req.param('officeId') || '';
        const repo = fudabaRepository(c);
        const current = validFudabaOfficeId(id)
            ? await repo.findOfficeReview(id)
            : null;
        if (!current)
            return c.json(
                { success: false, code: 'FUDABA_OFFICE_NOT_FOUND' },
                404,
            );
        const body = await c.req.json().catch(() => {
            throw Object.assign(new Error('请求体必须是有效 JSON'), {
                status: 400,
            });
        });
        const update = parseFudabaOfficeUpdate(body);
        const actor = c.get('backofficeUser')!;
        const at = new Date().toISOString();
        const result = await repo.updateOfficeForOwner({
            ...update,
            officeId: id,
            ownerAccountId: current.office.owner_account_id,
            updatedAt: at,
            adminAudit: {
                username: actor.username,
                producername: actor.producername,
                action: '编辑 Fudaba 事务所并提交整体审核',
                target: `${id}@${update.expectedRevision + 1}`,
                ip: getClientAddress(c),
                time: at,
            },
        });
        if (result.status === 'unavailable')
            return c.json(
                { success: false, code: 'FUDABA_OFFICE_NOT_FOUND' },
                404,
            );
        if (result.status !== 'saved')
            return c.json(
                {
                    success: false,
                    code: 'FUDABA_OFFICE_CONFLICT',
                    revision: result.revision,
                },
                409,
            );
        const item = await repo.findOfficeReview(id);
        if (!item)
            return c.json(
                { success: false, code: 'FUDABA_OFFICE_NOT_FOUND' },
                404,
            );
        return c.json({
            success: true,
            item: fudabaAdminOfficeReviewView(item),
        });
    } catch (error) {
        const status = statusFromError(error);
        return c.json(
            {
                success: false,
                code:
                    status >= 500
                        ? 'FUDABA_OFFICE_SAVE_FAILED'
                        : 'FUDABA_OFFICE_INVALID',
                message:
                    status >= 500 ? '事务所保存失败' : messageFromError(error),
            },
            status as 400 | 500,
        );
    }
}

export async function handleServeAdminFudabaOfficeMedia(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const id = c.req.param('officeId') || '';
    const slot = c.req.param('slot');
    const office = validFudabaOfficeId(id)
        ? await fudabaRepository(c).findOfficeById(id)
        : null;
    const key =
        slot === 'cover'
            ? office?.cover_object_key
            : slot === 'pending-cover'
              ? office?.pending_cover_object_key
              : null;
    if (!key)
        return c.json(
            { success: false, code: 'FUDABA_OFFICE_MEDIA_NOT_FOUND' },
            404,
        );
    const storage = services(c).storage;
    if (!storage)
        return c.json(
            { success: false, code: 'FUDABA_OFFICE_MEDIA_UNAVAILABLE' },
            503,
        );
    try {
        return (
            (await objectReadResponse(c.req.raw, storage, key, {
                'Cache-Control': 'private, no-store',
                Vary: 'Authorization, Cookie',
            })) ??
            c.json(
                { success: false, code: 'FUDABA_OFFICE_MEDIA_NOT_FOUND' },
                404,
            )
        );
    } catch {
        return c.json(
            { success: false, code: 'FUDABA_OFFICE_MEDIA_UNAVAILABLE' },
            503,
        );
    }
}
