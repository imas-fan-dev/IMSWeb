import {
    adminCardPageMediaPath,
    cardPageMediaPath,
    exchangeCardPageMediaPath,
    ownerCardPageMediaPath
} from '@imsweb/contracts/paths';
import type { FudabaCardPageRecord, FudabaCardRecord } from '@/ports/repositories';

export type CardPageScope = 'public' | 'admin' | 'owner';

export interface CardPageView {
    /** 稳定槽位：front、back、page-<uuid>。 */
    pageId: string;
    /** 由顺序决定的角色：第一页是正面，最后一页是背面（单面卡只有正面）。 */
    role: 'front' | 'back' | 'middle';
    /** 显示顺序，1 起。 */
    order: number;
    /** 原图：全屏预览用。 */
    url: string;
    /** 画廊用（800 档）。 */
    previewUrl: string;
    /** 列表瓦片用（400 档）。 */
    thumbUrl: string;
    width: number;
    height: number;
}

export interface CardArtworkView {
    live: CardPageView[];
    /** 没有待审版本时为 null。 */
    pending: CardPageView[] | null;
}

/** 列表与详情默认取瓦片 2x：视网膜屏不糊，体积也可控。 */
const DEFAULT_WIDTH = 800;

export function cardPageMediaUrl(input: {
    scope: CardPageScope;
    cardNumber: number;
    cardId: string;
    queue: 'live' | 'pending';
    pageId: string;
    /** Object version; included in the URL to bust browser caches after rotation. */
    version?: string;
    width?: number;
    /** 公开墙的地址族：交换墙按 UUID，名片墙按编号。 */
    publicRoute?: 'exchange' | 'cards';
    /** 原图：不带 `w`，让路由直接给原始对象。 */
    original?: boolean;
}): string {
    const page = encodeURIComponent(input.pageId);
    const params: string[] = [];
    if (!input.original) params.push(`w=${input.width ?? DEFAULT_WIDTH}`);
    if (input.version) params.push(`v=${encodeURIComponent(input.version)}`);
    if (input.scope === 'owner' && input.queue === 'pending') {
        params.push('draft=1');
    }
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    if (input.scope === 'public') {
        return `${
            input.publicRoute === 'cards'
                ? cardPageMediaPath(input.cardNumber, input.pageId)
                : exchangeCardPageMediaPath(input.cardId, input.pageId)
        }${query}`;
    }
    if (input.scope === 'admin') {
        // 后台路由的 variant 用 live/draft；pending 队列在地址上写作 draft。
        const variant = input.queue === 'pending' ? 'draft' : 'live';
        return `${adminCardPageMediaPath(input.cardNumber, variant, input.pageId)}${query}`;
    }
    return `${ownerCardPageMediaPath(input.cardId, input.pageId)}${query}`;
}

function pages(
    rows: readonly FudabaCardPageRecord[],
    input: {
        scope: CardPageScope;
        cardNumber: number;
        cardId: string;
        queue: 'live' | 'pending';
        publicRoute?: 'exchange' | 'cards';
    }
): CardPageView[] {
    return rows.map((row, index) => ({
        pageId: row.page_id,
        role:
            index === 0
                ? ('front' as const)
                : index === rows.length - 1
                  ? ('back' as const)
                  : ('middle' as const),
        order: row.display_order,
        url: cardPageMediaUrl({
            ...input,
            pageId: row.page_id,
            version: row.object_version,
            original: true
        }),
        previewUrl: cardPageMediaUrl({
            ...input,
            pageId: row.page_id,
            version: row.object_version
        }),
        thumbUrl: cardPageMediaUrl({
            ...input,
            pageId: row.page_id,
            version: row.object_version,
            width: 400
        }),
        width: row.width,
        height: row.height
    }));
}

/**
 * 页面行 → 对外视图。URL 由作用域决定，顺序由 `display_order` 决定；
 * 队列隔离在数据层，视图只负责拼地址。
 */
interface CardArtworkViewCommon {
    cardNumber: number;
    cardId: string;
    live: readonly FudabaCardPageRecord[];
    pending: readonly FudabaCardPageRecord[];
}

export type CardArtworkViewInput =
    | (CardArtworkViewCommon & {
          scope: 'public';
          publicRoute: 'exchange' | 'cards';
      })
    | (CardArtworkViewCommon & {
          scope: 'admin' | 'owner';
          publicRoute?: undefined;
      });

export function cardArtworkView(
    input: CardArtworkViewInput
): CardArtworkView {
    return {
        live: pages(input.live, {
            scope: input.scope,
            cardNumber: input.cardNumber,
            cardId: input.cardId,
            publicRoute: input.publicRoute,
            queue: 'live'
        }),
        pending:
            input.pending.length > 0
                ? pages(input.pending, {
                      scope: input.scope,
                      cardNumber: input.cardNumber,
                      cardId: input.cardId,
                      publicRoute: input.publicRoute,
                      queue: 'pending'
                  })
                : null
    };
}

/**
 * 属主写接口（新建 / 保存 / 换图）的响应要和列表、详情一样带页面视图：
 * 前端保存后会用响应里的卡刷新画廊，缺 `pages` 会把刚提交的图清空。
 */
export function ownerCardArtwork(
    card: Pick<FudabaCardRecord, 'id' | 'card_number'>,
    rows: {
        live: readonly FudabaCardPageRecord[];
        pending: readonly FudabaCardPageRecord[];
    }
): CardArtworkView {
    return cardArtworkView({
        scope: 'owner',
        cardNumber: card.card_number,
        cardId: card.id,
        live: rows.live,
        pending: rows.pending
    });
}
