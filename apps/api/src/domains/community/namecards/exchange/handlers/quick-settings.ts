import type { NamecardQuickSettings } from '@imsweb/contracts/namecards';
import type { NamecardQuickSelectionContext } from '@/domains/community/namecards/exchange/request';
import type { NamecardQuickSettingsResponse } from '@/domains/community/namecards/response';
import { toPublicNamecardResponse } from '@/domains/community/namecards/response';
import { resolveExchangeCardMedia } from '@/domains/community/namecards/exchange/media';
import { namecardRepository } from '@/middleware/hono-context';
import type { AppEnvironment } from '@/app';
import type { Context } from 'hono';

async function quickSettings(
    c: Context<AppEnvironment>,
): Promise<NamecardQuickSettings> {
    const accountId = c.get('platformUser')!.id;
    const repository = namecardRepository(c);
    const [candidates, selected] = await Promise.all([
        repository.listExchangeCandidates(accountId),
        repository.listQuickExchangeCards(accountId),
    ]);
    const picked = new Set(selected.map((card) => card.card_number ?? card.id));
    const cards = await Promise.all(
        candidates.map(async (card) => {
            const resolved = await resolveExchangeCardMedia(
                c,
                toPublicNamecardResponse(card, accountId),
            );
            return {
                cardNumber: card.card_number ?? card.id,
                pages: resolved.pages ?? [],
                exchangeMode:
                    card.exchange_mode === 'auto' ||
                    card.exchange_mode === 'manual'
                        ? card.exchange_mode
                        : ('none' as const),
                selected: picked.has(card.card_number ?? card.id),
            };
        }),
    );
    return { limit: 20, cards };
}

/** 我自己勾选的快速交换清单。 */
export async function handleGetQuickSettings(
    c: Context<AppEnvironment>,
): Promise<Response> {
    return c.json((await quickSettings(c)) satisfies NamecardQuickSettingsResponse);
}

/** 整份覆盖：一次保存就是一次完整的勾选结果。 */
export async function handlePutQuickSettings(
    c: NamecardQuickSelectionContext,
): Promise<Response> {
    const { cardNumbers } = c.req.valid('json');
    await namecardRepository(c).replaceQuickExchangeCards({
        accountId: c.get('platformUser')!.id,
        cardNumbers,
    });
    return c.json((await quickSettings(c)) satisfies NamecardQuickSettingsResponse);
}
