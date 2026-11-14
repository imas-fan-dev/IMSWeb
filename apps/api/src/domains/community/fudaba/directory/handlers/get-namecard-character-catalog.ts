import type { NamecardCharacterCatalog } from '@imsweb/contracts/fudaba/characters';
import { NAMECARD_CHARACTER_CATEGORIES } from '@imsweb/contracts/fudaba/runtime';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    namecardCharacterCatalogAgencyView,
    namecardCharacterCatalogEntryView,
    namecardCharacterCatalogUnitView,
} from '@/domains/community/fudaba/directory/response';
import {
    namecardCharacterRepository,
    namecardUnitRepository,
} from '@/middleware/hono-context';

export async function handleGetNamecardCharacterCatalog(
    c: Context<AppEnvironment>
): Promise<Response> {
    const characters = namecardCharacterRepository(c);
    const [agencies, entries, units] = await Promise.all([
        characters.listNamecardCharacterAgencies(),
        characters.listNamecardCharacterCatalog(),
        namecardUnitRepository(c).listNamecardUnitCatalog(),
    ]);
    const payload: NamecardCharacterCatalog = {
        agencies: agencies.map(namecardCharacterCatalogAgencyView),
        categories: [...NAMECARD_CHARACTER_CATEGORIES],
        characters: entries.map(namecardCharacterCatalogEntryView),
        units: units.map(namecardCharacterCatalogUnitView),
    };
    return c.json(payload);
}
