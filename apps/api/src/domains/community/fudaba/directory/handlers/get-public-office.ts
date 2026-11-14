// pi-lens-ignore: ts:2724
import type { FudabaOfficeDetailResponse } from '@imsweb/contracts/fudaba';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { assertNoFudabaQuery, validFudabaOfficeSlug } from '@/domains/community/fudaba/directory/request';
import { fudabaPublicOfficeView, fudabaPublicPlacedCardView } from '@/domains/community/fudaba/directory/response';
import { fudabaRepository, services } from '@/middleware/hono-context';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';

export async function handleGetFudabaPublicOffice(
    c: Context<AppEnvironment>
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    const slug = c.req.param('officeSlug');
    if (!slug || !validFudabaOfficeSlug(slug)) {
        return c.json({ error: 'Invalid Fudaba office slug' }, 400);
    }
    const office = await fudabaRepository(c).findPublicOfficeBySlug(
        slug,
        c.get('platformUser')?.id ?? null
    );
    if (!office) return c.json({ error: 'Fudaba office not found' }, 404);
    const storage = services(c).storage;
    const pagesByCard = (await fudabaRepository(c).listCardPagesBatch?.(
        office.cards.map(card => card.id)
    )) ?? new Map();
    const [view, cards] = await Promise.all([
        fudabaPublicOfficeView(storage, office),
        Promise.all(office.cards.map((card) => {
            const rows = pagesByCard.get(card.id);
            const pages = cardArtworkView({
                scope: 'public', publicRoute: 'exchange',
                cardNumber: 0, cardId: card.id,
                live: rows?.live ?? [], pending: []
            }).live;
            return fudabaPublicPlacedCardView(storage, card, pages);
        }))
    ]);
    return c.json({
        office: { ...view, cards }
    } satisfies FudabaOfficeDetailResponse);
}
