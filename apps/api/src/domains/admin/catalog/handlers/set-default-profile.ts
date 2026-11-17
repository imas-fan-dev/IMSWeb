import type {
    AdminCatalogDefaultProfileRequest,
    AdminCatalogMutation,
} from '@imsweb/contracts/catalog';
import type { CatalogJsonContext } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { catalogRepository } from '@/middleware/hono-context';
import { writeAudit } from '@/domains/admin/audit/write-audit';

export async function handleSetAdminCatalogDefaultProfile(
    c: CatalogJsonContext<AdminCatalogDefaultProfileRequest>,
): Promise<Response> {
    try {
        const input = c.req.valid('json');
        await catalogRepository(c).setDefaultProfile(input);
        await writeAudit(
            c,
            'catalog_default_profile_set',
            `${input.ownerId}:${input.profileId}`,
        );
        return c.json({ success: true } satisfies AdminCatalogMutation);
    } catch (error) {
        return catalogError(c, error);
    }
}
