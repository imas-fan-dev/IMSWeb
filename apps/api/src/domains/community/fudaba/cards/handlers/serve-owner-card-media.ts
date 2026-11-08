import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository, services } from '@/middleware/hono-context';
import { readSizedCardPage } from '@/domains/community/fudaba/cards/artwork-store';
import { objectReadResponse } from '@/utils/http/object-read-response';

export async function handleServeFudabaOwnerCardMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    const side = c.req.param('side') || '';
    // `middle-<1-based index>` addresses an ordered middle page.
    const middle = /^middle-(\d{1,2})$/.exec(side);
    const page = /^page-[0-9a-f-]{8,}$/.test(side);
    if (
        !validFudabaCardId(cardId) ||
        (side !== 'front' && side !== 'back' && !middle && !page)
    ) {
        return c.text('Not Found', 404);
    }
    const card = await fudabaRepository(c).findCardForOwner(
        cardId,
        c.get('platformUser')!.id
    );
    if (!card) return c.text('Not Found', 404);
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    // `draft=1` asks for the revision still under review. A revision owns its
    // own page set only when it staged artwork; a text-only edit keeps serving
    // the live pages.
    const draft = c.req.query('draft') === '1';
    const stagedArtwork =
        draft &&
        (card.pending_front_object_key !== null ||
            card.pending_back_object_key !== null ||
            card.pending_middle_object_keys.length > 0);
    const keys = stagedArtwork
        ? card.pending_middle_object_keys
        : card.middle_object_keys;
    // 统一布局的页面按稳定槽位取 key；待审那一套由 `draft=1` 选择。
    if (page) {
        const found = await fudabaRepository(c).findCardPageKeyForOwner(
            cardId,
            c.get('platformUser')!.id,
            side,
            draft
        );
        if (!found) return c.text('Not Found', 404);
        const w = c.req.query('w');
        if (w) {
            const sized = await readSizedCardPage(
                { storage, images: services(c).images },
                { key: found.key, width: Number(w) }
            );
            if (!sized) return c.text('Not Found', 404);
            const bytes = sized.body.slice();
            return c.body(bytes.buffer as ArrayBuffer, 200, {
                'Content-Type': sized.contentType,
                'Cache-Control': 'private, no-store',
                Vary: 'Authorization, Cookie'
            });
        }
        const servedPage = found.key;
        const pageResponse = await objectReadResponse(
            c.req.raw,
            storage,
            servedPage,
            { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' },
            {
                mode:
                    c.get('platformAuthSource') === 'authorization'
                        ? 'proxy'
                        : 'redirect'
            }
        );
        return pageResponse ?? c.text('Not Found', 404);
    }
    let key: string | null =
        side === 'front'
            ? (stagedArtwork ? card.pending_front_object_key : card.front_object_key)
            : side === 'back'
              ? (stagedArtwork ? card.pending_back_object_key : card.back_object_key)
              : (keys[Number(middle![1]) - 1] ?? null);
    // 统一页面布局的列可能为空或落后；正/背面必须按页面行首/末页解析。
    if (side === 'front' || side === 'back') {
        const allPages = await fudabaRepository(c).listCardPages(cardId);
        const queue = draft ? allPages.pending : allPages.live;
        const pages = queue.length > 0 ? queue : allPages.live;
        const edge =
            side === 'front'
                ? pages[0]
                : pages.length > 1
                  ? pages[pages.length - 1]
                  : null;
        if (edge) {
            const found = await fudabaRepository(c).findCardPageKeyForOwner(
                cardId,
                c.get('platformUser')!.id,
                edge.page_id,
                queue.length > 0 && queue === allPages.pending
            );
            if (found) key = found.key;
        } else if (side === 'back') {
            key = null;
        }
    }
    if (!key) return c.text('Not Found', 404);
    const response = await objectReadResponse(c.req.raw, storage, key, {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization, Cookie'
    }, {
        // App bearer reads stay on the authenticated API origin. Storage hosts
        // need no browser CORS policy, even when they support signed redirects.
        mode: c.get('platformAuthSource') === 'authorization' ? 'proxy' : 'redirect'
    });
    return response ?? c.text('Not Found', 404);
}
