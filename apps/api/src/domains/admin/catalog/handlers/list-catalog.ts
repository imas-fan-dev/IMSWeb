import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { AdminCatalog } from '@imsweb/contracts/catalog';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import { catalogRepository, services } from '@/middleware/hono-context';
import { catalogError, catalogProfileView } from '@/domains/admin/catalog/response';

export async function handleListAdminCatalog(c: Context<AppEnvironment>): Promise<Response> {
    const actor = c.get('backofficeUser');
    if (!actor || !['op', 'editor'].includes(actor.dept)) {
        return c.json({ success: false, message: '无权读取资料库管理数据' } satisfies FailureMessageResponse, 403);
    }
    try {
        const snapshot = await catalogRepository(c).snapshot();
        const storage = services(c).storage;
        const payload: AdminCatalog = {
            ...snapshot,
            characters: await Promise.all(snapshot.characters.map(async (row) => ({
                ...row, profiles: await Promise.all(row.profiles.map((p) => catalogProfileView(p, storage, 'character'))),
            }))),
            groups: await Promise.all(snapshot.groups.map(async (row) => ({
                ...row, profiles: await Promise.all(row.profiles.map((p) => catalogProfileView(p, storage, 'group'))),
            }))),
        };
        return c.json(payload);
    } catch (error) { return catalogError(c, error); }
}
