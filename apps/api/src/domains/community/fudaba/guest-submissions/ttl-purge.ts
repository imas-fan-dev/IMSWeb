import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { deleteNamecardMedia } from '@/domains/community/fudaba/card-media-assets';
import { namecardRepository, services } from '@/middleware/hono-context';

const NAMECARD_TERMINAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export async function purgeExpiredNamecardSubmissions(
    c: Context<AppEnvironment>
): Promise<void> {
    try {
        const cutoff = new Date(Date.now() - NAMECARD_TERMINAL_TTL_MS);
        const expired = await namecardRepository(c).purgeTerminalCards(cutoff);
        await Promise.all(expired.map((row) =>
            deleteNamecardMedia(services(c), [row.image1_url, row.image2_url])
                .catch(() => undefined)
        ));
    } catch (error) {
        console.error('Failed to purge expired namecard submissions', error);
    }
}
