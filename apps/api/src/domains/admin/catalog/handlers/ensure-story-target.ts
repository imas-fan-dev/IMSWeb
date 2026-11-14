import type { AdminCatalogStoryTargetRequest, AdminCatalogStoryTargetResponse } from '@imsweb/contracts/catalog';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { CatalogJsonContext } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { catalogRepository } from '@/middleware/hono-context';
import { writeAudit } from '@/domains/admin/audit/write-audit';

export async function handleEnsureCharacterStoryTarget(
    c: CatalogJsonContext<AdminCatalogStoryTargetRequest>,
): Promise<Response> {
    try {
        const actor = c.get('backofficeUser');
        if (!actor || !['op', 'editor'].includes(actor.dept))
            return c.json(
                {
                    success: false,
                    message: '无权维护角色剧情关联',
                } satisfies FailureMessageResponse,
                403,
            );
        const result: AdminCatalogStoryTargetResponse = await catalogRepository(c).ensureCharacterStoryTarget(
            c.req.valid('json').profileId,
        );
        await writeAudit(c, 'catalog_story_target', String(result.entryId));
        return c.json(result);
    } catch (error) {
        return catalogError(c, error);
    }
}
