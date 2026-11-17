import type { AdminCatalogGroupKindRequest, AdminCatalogMutation } from '@imsweb/contracts/catalog';
import type { CatalogJsonContext } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { catalogRepository } from '@/middleware/hono-context';
import { writeAudit } from '@/domains/admin/audit/write-audit';

export async function handleSaveAdminCatalogGroupKind(c: CatalogJsonContext<AdminCatalogGroupKindRequest>): Promise<Response> {
    try {
        const input = c.req.valid('json');
        await catalogRepository(c).saveGroupKind(input);
        await writeAudit(c, 'catalog_group_kind', String(input.id));
        return c.json({ success: true } satisfies AdminCatalogMutation);
    } catch (error) { return catalogError(c, error); }
}
