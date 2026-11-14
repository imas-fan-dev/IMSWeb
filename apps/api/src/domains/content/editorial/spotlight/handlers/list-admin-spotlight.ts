import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    toAdminEditorialSpotlightEntryResponse,
    type AdminEditorialSpotlightResponse
} from '@/domains/content/editorial/response';
import { editorialRepository } from '@/middleware/hono-context';

export async function handleListAdminSpotlight(
    c: Context<AppEnvironment>
): Promise<Response> {
    const rows = await editorialRepository(c).listAdminSpotlightEntries();
    return c.json({
        items: rows.map(toAdminEditorialSpotlightEntryResponse)
    } satisfies AdminEditorialSpotlightResponse);
}
