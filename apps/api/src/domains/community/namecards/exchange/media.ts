import type { AppEnvironment } from '@/app';
import type {
    Namecard,
    NamecardCollectionSnapshot,
} from '@imsweb/contracts/namecards';
import { services } from '@/middleware/hono-context';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';
import type { Context } from 'hono';

/**
 * The wall and the profile hand out signed storage addresses, and every other
 * reader must do the same: the exchange payloads used to hand out raw object
 * keys, which the browser cannot load.
 */
export async function resolveExchangeCardMedia(
    c: Context<AppEnvironment>,
    card: Namecard,
): Promise<Namecard> {
    const storage = services(c).storage;
    if (!storage) return card;
    const image1Url = await resolvePublicMediaUrl(storage, card.image1_url);
    const image2Url =
        card.image2_url == null
            ? null
            : await resolvePublicMediaUrl(storage, card.image2_url);
    return {
        ...card,
        image1_url: image1Url,
        image2_url: image2Url,
        image1_thumbnail_url: image1Url,
        image2_thumbnail_url: image2Url,
        middleImageUrls: await Promise.all(
            card.middleImageUrls.map((url) => resolvePublicMediaUrl(storage, url)),
        ),
    };
}

/** The shelf keeps the projection it saw at exchange time, keys included. */
export async function resolveSnapshotMedia(
    c: Context<AppEnvironment>,
    snapshot: NamecardCollectionSnapshot,
): Promise<NamecardCollectionSnapshot> {
    const storage = services(c).storage;
    if (!storage) return snapshot;
    const image1Url = await resolvePublicMediaUrl(storage, snapshot.image1_url);
    return {
        ...snapshot,
        image1_url: image1Url,
        image2_url:
            snapshot.image2_url == null
                ? null
                : await resolvePublicMediaUrl(storage, snapshot.image2_url),
        middleImageUrls: await Promise.all(
            snapshot.middleImageUrls.map((url) =>
                resolvePublicMediaUrl(storage, url),
            ),
        ),
    };
}
