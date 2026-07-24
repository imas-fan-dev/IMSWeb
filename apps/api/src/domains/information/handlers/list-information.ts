import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { informationCardSummary } from '@/domains/information/data';
import { readInformationIndex } from '@/domains/information/content-store';
import { services } from '@/middleware/hono-context';

export async function handleListInformation(c: Context<AppEnvironment>): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { index } = await readInformationIndex(storage);
    c.header('Cache-Control', 'no-cache');
    return c.json({ cards: index.cards.map(informationCardSummary) });
}
