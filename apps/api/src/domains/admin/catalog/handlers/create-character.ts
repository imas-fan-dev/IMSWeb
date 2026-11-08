import type {
    AdminCatalogCreateCharacterRequest,
    AdminCatalogCreateCharacterResponse,
} from '@imsweb/contracts/catalog';
import type { CatalogJsonContext } from '@/domains/admin/catalog/request';
import { catalogError } from '@/domains/admin/catalog/response';
import { catalogRepository } from '@/middleware/hono-context';
import { writeAudit } from '@/domains/admin/audit/write-audit';

export async function handleCreateAdminCatalogCharacter(
    c: CatalogJsonContext<AdminCatalogCreateCharacterRequest>,
): Promise<Response> {
    try {
        const user = c.get('backofficeUser');
        if (!user) throw Object.assign(new Error('未登录'), { status: 401 });
        const actorId = Number(user.id);
        if (!Number.isSafeInteger(actorId) || actorId < 1)
            throw Object.assign(new Error('未登录'), { status: 401 });
        const result = await catalogRepository(c).createCharacter(
            c.req.valid('json'),
            actorId,
        );
        await writeAudit(
            c,
            'catalog_character_create',
            String(result.characterId),
        );
        return c.json({
            success: true,
            ...result,
        } satisfies AdminCatalogCreateCharacterResponse);
    } catch (error) {
        return catalogError(c, error);
    }
}
