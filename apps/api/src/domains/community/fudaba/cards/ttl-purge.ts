import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';
import { namecardRepository, services } from '@/middleware/hono-context';

const NAMECARD_TERMINAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export async function purgeExpiredNamecardSubmissions(
    c: Context<AppEnvironment>
): Promise<void> {
    try {
        const cutoff = new Date(Date.now() - NAMECARD_TERMINAL_TTL_MS);
        const expired = await namecardRepository(c).purgeTerminalCards(cutoff);
        await Promise.all(expired.flatMap((row) =>
            row.objectKeys.map((key) =>
                deleteObjectWithCompensation(services(c), key)
                    .catch(() => undefined)
            )
        ));
    } catch (error) {
        console.error('Failed to purge expired namecard submissions', error);
    }
}
