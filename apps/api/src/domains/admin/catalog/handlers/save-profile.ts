import type { AdminCatalogMutation, AdminCatalogProfileRequest } from '@imsweb/contracts/catalog';
import type { CatalogJsonContext } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { catalogRepository } from '@/middleware/hono-context';
import { writeAudit } from '@/domains/admin/audit/write-audit';

export async function handleSaveAdminCatalogProfile(c: CatalogJsonContext<AdminCatalogProfileRequest>): Promise<Response> {
    try {
        const input = c.req.valid('json');
        await catalogRepository(c).saveProfile(input);
        await writeAudit(c, 'catalog_profile_save', `${input.kind}:${input.ownerId}:${input.projectId}`);
        return c.json({ success: true } satisfies AdminCatalogMutation);
    } catch (error) { return catalogError(c, error); }
}
