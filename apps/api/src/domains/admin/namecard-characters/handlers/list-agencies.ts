import type { NamecardCharacterAgencyList } from '@imsweb/contracts/fudaba/admin-characters';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { toNamecardCharacterAgency } from '@/domains/admin/namecard-characters/response';
import { namecardCharacterRepository } from '@/middleware/hono-context';

export async function handleListAdminNamecardCharacterAgencies(
    c: Context<AppEnvironment>
): Promise<Response> {
    const agencies =
        await namecardCharacterRepository(c).listNamecardCharacterAgencies();
    const payload: NamecardCharacterAgencyList = {
        success: true,
        agencies: agencies.map(toNamecardCharacterAgency)
    };
    return c.json(payload);
}
