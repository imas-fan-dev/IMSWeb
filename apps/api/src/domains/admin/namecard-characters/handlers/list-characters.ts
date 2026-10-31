import type { NamecardCharacterList } from '@imsweb/contracts/fudaba/admin-characters';
import type { NamecardCharacterListRequestContext } from '@/domains/admin/namecard-characters/request';
import { toNamecardCharacter } from '@/domains/admin/namecard-characters/response';
import { namecardCharacterRepository } from '@/middleware/hono-context';

export async function handleListAdminNamecardCharacters(
    c: NamecardCharacterListRequestContext
): Promise<Response> {
    const query = c.req.valid('query');
    const repository = namecardCharacterRepository(c);
    const filter = {
        query: query.query,
        agencyId: query.agencyId,
        category: query.category
    };
    const [records, total] = await Promise.all([
        repository.listNamecardCharacters({
            ...filter,
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize
        }),
        repository.countNamecardCharacters(filter)
    ]);
    const totalPages = Math.ceil(total / query.pageSize);
    const payload: NamecardCharacterList = {
        success: true,
        characters: records.map(toNamecardCharacter),
        pageInfo: {
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages,
            hasNextPage: query.page < totalPages
        }
    };
    return c.json(payload);
}
