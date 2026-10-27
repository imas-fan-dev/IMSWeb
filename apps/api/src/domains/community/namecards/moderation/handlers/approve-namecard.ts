import { PUBLIC_UPLOADS_PATH_PREFIX } from '@imsweb/contracts/paths';
import { writeAudit } from '@/domains/admin/audit/write-audit';
import {
    ensureNamecardThumbnails,
    publishNamecardMedia
} from '@/domains/community/fudaba/card-media-assets';
import type { NamecardMutationContext } from '@/domains/community/namecards/request';
import type {
    NamecardErrorResponse,
    NamecardMutationResponse
} from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import {
    namecardCardMediaObjectKey,
    namecardOriginalUrlFromObjectKey
} from '@/utils/storage/business-object-keys';

// Registered-user uploads keep their own layout until approval; every public
// reader only understands community/namecards/assets/<stem>/image.<ext>.
const EXCHANGE_MEDIA_KEY = /^community\/fudaba\/cards\/([^/]+)\/(front|back)\.([a-z0-9]+)$/;
// The moderation queue exposes those uploads through an authenticated review
// route, so the approval path may receive either shape.
const EXCHANGE_REVIEW_URL =
    /^\/api\/admin\/community\/exchange\/card-reviews\/([^/]+)\/media\/(front|back)$/;

function exchangeUpload(value: string): { cardId: string; side: string; ext: string } | null {
    const key = EXCHANGE_MEDIA_KEY.exec(value);
    if (key) return { cardId: key[1], side: key[2], ext: key[3] };
    const url = EXCHANGE_REVIEW_URL.exec(value);
    if (url) return { cardId: url[1], side: url[2], ext: 'webp' };
    return null;
}

export async function handleApproveNamecard(c: NamecardMutationContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const { expected_revision: revision } = c.req.valid('json');
    try {
        const repository = namecardRepository(c);
        const claim = await repository.beginCardApproval(id, revision);
        if (claim.status === 'not-found') {
            return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
        }
        if (claim.status === 'conflict') {
            return c.json({
                error: 'Namecard changed; refresh and retry',
                revision: claim.revision
            } satisfies NamecardErrorResponse, 409);
        }
        if (claim.status === 'withdrawn') {
            return c.json({
                error: '用户已撤回',
                revision: claim.revision
            } satisfies NamecardErrorResponse, 410);
        }
        // A failed attempt leaves the row in `approving` on purpose: the retry
        // path recognises that claim (revision+1) and resumes it, whereas
        // reverting to `pending` would let a stale reviewer approve a newer
        // edit the owner submitted in the meantime.
        const runtime = services(c);
        const storage = runtime.storage;
        if (!storage) throw new Error('Object storage publication is unavailable');
        // Both layouts must end up in the canonical
        // community/namecards/assets/<stem>/image.<ext> shape before publication:
        // that is the only layout the thumbnail helper and the public key
        // reversal understand. Registered-user uploads still point at
        // community/fudaba/cards/<uuid>/front|back.<ext>, so copy those objects
        // across, rewrite the row, then publish as usual.
        const canonicalUrls: string[] = [];
        const rewritten: { front?: string; back?: string } = {};
        let uploadCardId: string | null = null;
        for (const [side, value] of [
            ['front', claim.card.image1_url],
            ['back', claim.card.image2_url]
        ] as const) {
            if (typeof value !== 'string') continue;
            if (
                value.startsWith(`${PUBLIC_UPLOADS_PATH_PREFIX}/`) ||
                value.startsWith('http')
            ) {
                canonicalUrls.push(value);
                continue;
            }
            if (value.startsWith('community/namecards/assets/')) {
                canonicalUrls.push(namecardOriginalUrlFromObjectKey(value));
                continue;
            }
            const upload = exchangeUpload(value);
            if (!upload) throw new Error(`Unsupported namecard object key: ${value}`);
            const sourceKey = `community/fudaba/cards/${upload.cardId}/${upload.side}.${upload.ext}`;
            const original = await storage.get(sourceKey);
            if (!original) throw new Error(`Namecard original object not found: ${sourceKey}`);
            const canonicalKey = namecardCardMediaObjectKey(upload.cardId, side, upload.ext);
            await storage.put(canonicalKey, original.body, {
                contentType: 'image/webp',
                protectedAccess: true
            });
            uploadCardId = upload.cardId;
            rewritten[side] = canonicalKey;
            canonicalUrls.push(namecardOriginalUrlFromObjectKey(canonicalKey));
        }
        if (uploadCardId !== null && (rewritten.front ?? rewritten.back) !== undefined) {
            await repository.attachCanonicalMedia(
                uploadCardId,
                rewritten.front ?? (claim.card.image1_url as string),
                rewritten.back ?? (claim.card.image2_url as string)
            );
        }
        if (canonicalUrls.length > 0) {
            await ensureNamecardThumbnails({ ...runtime, storage }, canonicalUrls);
            await publishNamecardMedia(storage, canonicalUrls);
        }
        const completed = await repository.completeCardApproval(id, claim.card.revision);
        if (completed.status !== 'updated') {
            return c.json({
                error: 'Namecard changed; refresh and retry',
                ...(completed.status === 'conflict' ? { revision: completed.revision } : {})
            } satisfies NamecardErrorResponse, 409);
        }
        await writeAudit(c, '审核图片通过', `card_id=${id};revision=${completed.card.revision}`);
        return c.json({
            success: true,
            revision: completed.card.revision
        } satisfies NamecardMutationResponse);
    } catch (error) {
        console.error('Failed to approve namecard', error);
        return c.json({ error: '服务器错误' } satisfies NamecardErrorResponse, 500);
    }
}
