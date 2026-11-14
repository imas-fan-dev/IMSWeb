import type { AdminCatalogBindingRequest, AdminCatalogMutation } from '@imsweb/contracts/catalog';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { CatalogJsonContext } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { catalogRepository } from '@/middleware/hono-context';
import { writeAudit } from '@/domains/admin/audit/write-audit';

export async function handleSaveAdminCatalogWikiBinding(c: CatalogJsonContext<AdminCatalogBindingRequest>): Promise<Response> {
    try {
        const actor = c.get('backofficeUser');
        if (!actor || !['op', 'editor'].includes(actor.dept)) {
            return c.json({ success: false, message: '无权编辑 Wiki 绑定' } satisfies FailureMessageResponse, 403);
        }
        const input = c.req.valid('json');
        await catalogRepository(c).saveBinding(input);
        await writeAudit(c, 'catalog_wiki_binding', `${input.kind}:${input.id}`);
        return c.json({ success: true } satisfies AdminCatalogMutation);
    } catch (error) { return catalogError(c, error); }
}
