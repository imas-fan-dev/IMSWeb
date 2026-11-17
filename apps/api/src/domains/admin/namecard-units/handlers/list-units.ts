import type { NamecardUnitList } from '@imsweb/contracts/fudaba/admin-units';
import type { NamecardUnitListRequestContext } from '@/domains/admin/namecard-units/request';
import { toNamecardUnit } from '@/domains/admin/namecard-units/response';
import { namecardUnitRepository } from '@/middleware/hono-context';

export async function handleListAdminNamecardUnits(
    c: NamecardUnitListRequestContext
): Promise<Response> {
    const query = c.req.valid('query');
    const repository = namecardUnitRepository(c);
    const filter = {
        query: query.query,
        memberIds: query.memberIds,
        agencyId: query.agencyId
    };
    const [records, total] = await Promise.all([
        repository.listNamecardUnits({
            ...filter,
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize
        }),
        repository.countNamecardUnits(filter)
    ]);
    const totalPages = Math.ceil(total / query.pageSize);
    const payload: NamecardUnitList = {
        success: true,
        units: records.map(toNamecardUnit),
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
