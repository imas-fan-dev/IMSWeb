import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { namecardRepository, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

const NAMECARD_TERMINAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export async function purgeExpiredNamecardSubmissions(
    c: Context<AppEnvironment>
): Promise<void> {
    try {
        const cutoff = new Date(Date.now() - NAMECARD_TERMINAL_TTL_MS);
        const expired = await namecardRepository(c).purgeTerminalCards(cutoff);
        await Promise.all(expired.map((row) =>
            Promise.all([row.image1_url, row.image2_url].map((url) =>
                deleteObjectWithCompensation(services(c), publicMediaObjectKey(url)).catch(() => undefined)
            ))
        ));
    } catch (error) {
        console.error('Failed to purge expired namecard submissions', error);
    }
}
