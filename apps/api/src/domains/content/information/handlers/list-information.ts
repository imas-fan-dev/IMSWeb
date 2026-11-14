import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { informationCardSummary } from '@/domains/content/information/data';
import { readInformationIndex } from '@/domains/content/information/content-store';
import type { PublicInformationListResponse } from '@/domains/content/information/response';
import { publicInformationSummary } from '@/domains/content/information/public-response';
import { services } from '@/middleware/hono-context';

export async function handleListInformation(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    c.header('Cache-Control', 'no-cache');
    return c.json({
        cards: await Promise.all(index.cards.map((card) =>
            publicInformationSummary(storage, informationCardSummary(card))
        ))
    } satisfies PublicInformationListResponse);
}
