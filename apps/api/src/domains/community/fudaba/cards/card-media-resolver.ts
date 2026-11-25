import type {
    FudabaCardPageRecord,
    FudabaCardRecord,
    FudabaRepository
} from '@/ports/repositories/fudaba';
import type { NamecardRepository } from '@/ports/repositories/namecards';
import { cardPageObjectKey } from '@/utils/storage/business-object-keys';

/**
 * 一套页面行的对象 key，按 display_order。行上的 `object_queue` 说明对象实际落
 * 在哪个队列：完整的待审快照里，未改动的页仍指向线上对象。
 */
export function cardPageObjectKeys(
    cardId: string,
    queue: 'live' | 'pending',
    pages: readonly FudabaCardPageRecord[]
): string[] {
    return pages.map((page) =>
        cardPageObjectKey(
            cardId,
            page.object_queue ?? queue,
            page.page_id,
            page.object_version
        )
    );
}

type PublishedLookup = Pick<
    NamecardRepository,
    'findPublishedCardPageKey'
>;

/** Public page row is the only source; no legacy column fallback. */
export async function resolvePublicCardMediaKey(
    repository: PublishedLookup,
    cardNumber: number,
    side: string
): Promise<string | null> {
    return repository.findPublishedCardPageKey(cardNumber, side);
}

type AdminLookup = Pick<NamecardRepository, 'findCardMediaKey'>;

type OwnerLookup = Pick<
    FudabaRepository,
    'findCardPageKeyForOwner' | 'listCardPages'
>;

/** Moderator lookup: the card's page rows, live/pending by `draft`. */
export async function resolveAdminCardMediaKey(
    repository: AdminLookup,
    cardNumber: number,
    side: string,
    draft: boolean
): Promise<string | null> {
    return repository.findCardMediaKey(cardNumber, side, draft);
}

/** Owner lookup: page rows alone; draft uses the complete pending snapshot. */
export async function resolveOwnerCardMediaKey(
    repository: OwnerLookup,
    card: FudabaCardRecord,
    ownerAccountId: string,
    side: string,
    draft: boolean
): Promise<string | null> {
    const allPages = await repository.listCardPages(card.id);
    const pending = draft && allPages.pending.length > 0;
    const pages = pending ? allPages.pending : allPages.live;
    if (/^page-[0-9a-f-]{8,}$/.test(side)) {
        const row = pages.find((page) => page.page_id === side);
        if (!row) return null;
        const found = await repository.findCardPageKeyForOwner(
            card.id,
            ownerAccountId,
            side,
            pending
        );
        return found?.key ?? null;
    }
    const middle = /^middle-(\d{1,2})$/.exec(side);
    const index =
        side === 'front'
            ? 0
            : side === 'back'
              ? pages.length > 1
                  ? pages.length - 1
                  : -1
              : middle
                ? Number(middle[1])
                : -1;
    const row = index >= 0 ? pages[index] : undefined;
    if (!row) return null;
    const found = await repository.findCardPageKeyForOwner(
        card.id,
        ownerAccountId,
        row.page_id,
        pending
    );
    return found?.key ?? null;
}
