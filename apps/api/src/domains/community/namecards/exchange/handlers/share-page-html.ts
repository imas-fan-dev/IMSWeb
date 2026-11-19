import type { AppEnvironment } from '@/app';
import type {
    NamecardCardShareResponse,
    NamecardQuickExchangeResponse,
} from '@/domains/community/namecards/response';
import { loadCardShareModel } from '@/domains/community/namecards/exchange/handlers/get-card-share';
import { loadQuickExchangeModel } from '@/domains/community/namecards/exchange/handlers/get-quick-exchange';
import { namecardRepository, services } from '@/middleware/hono-context';
import type { Context } from 'hono';

const SITE_NAME = 'IMSWeb';
const SITE_TITLE = 'IMSWeb | 偶像大师交流站';
const SITE_DESCRIPTION = '面向中文制作人社区的偶像大师资料、活动与共同创作入口。';
/** 缩略图按 400 方图报给平台：`thumbUrl` 本来就是 400 宽变体。 */
const TILE_SIZE = 400;

export interface ShareImage {
    url: string;
    width: number;
    height: number;
}

/** 一次分享页请求要注入的标签值，全部是已经拼好的最终文本。 */
export interface ShareMeta {
    title: string;
    description: string;
    /** 绝对地址：站外抓取器不会补站点的相对路径。 */
    url: string;
    siteName: string;
    image?: ShareImage;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function absoluteUrl(value: string, origin: string): string {
    try {
        return new URL(value, origin).toString();
    } catch {
        // 媒体地址理论上都合法，真出错时原样给出，至少不丢一份可读的地址。
        return value;
    }
}

/** 正面（`pages` 里 `role === 'front'` 的那页）的缩略图；没有图就整块省略。 */
function frontImage(
    pages: NamecardCardShareResponse['card']['pages'],
    origin: string,
): ShareImage | undefined {
    const front = pages?.find((page) => page.role === 'front');
    if (!front?.thumbUrl) return undefined;
    return {
        url: absoluteUrl(front.thumbUrl, origin),
        width: TILE_SIZE,
        height: TILE_SIZE,
    };
}

function metaTag(attribute: 'name' | 'property', key: string, content: string): string {
    return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
}

function shareMetaBlock(meta: ShareMeta): string {
    return [
        `<title>${escapeHtml(meta.title)}</title>`,
        metaTag('name', 'description', meta.description),
        metaTag('property', 'og:type', 'website'),
        metaTag('property', 'og:site_name', meta.siteName),
        metaTag('property', 'og:title', meta.title),
        metaTag('property', 'og:description', meta.description),
        ...(meta.image
            ? [
                  metaTag('property', 'og:image', meta.image.url),
                  metaTag('property', 'og:image:width', String(meta.image.width)),
                  metaTag('property', 'og:image:height', String(meta.image.height)),
              ]
            : []),
        metaTag('property', 'og:url', meta.url),
        metaTag('name', 'twitter:card', 'summary'),
        metaTag('name', 'twitter:title', meta.title),
        metaTag('name', 'twitter:description', meta.description),
        ...(meta.image ? [metaTag('name', 'twitter:image', meta.image.url)] : []),
    ].join('');
}

/**
 * 把逐页标签注入 SPA 空壳：空壳自带的是站点默认 `<title>` 与 description，
 * 先删掉再在 `<head>` 后面插一份自己的，保证每个分享页只有一套标签。
 */
export function injectShareMeta(shellHtml: string, meta: ShareMeta): string {
    const stripped = shellHtml
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>\s*/gi, '')
        .replace(/<meta\b[^>]*\bname=["']description["'][^>]*>\s*/gi, '');
    const block = shareMetaBlock(meta);
    const head = /<head\b[^>]*>/i.exec(stripped);
    // 空壳没有 `<head>` 时也照常返回，只是标签落在开头。
    if (!head) return block + stripped;
    const at = head.index + head[0].length;
    return `${stripped.slice(0, at)}${block}${stripped.slice(at)}`;
}

let shellPromise: Promise<string | null> | null = null;

/** 空壳在构建期固定不变，进程内只取一次；取失败不缓存，下次请求再试。 */
function loadShareShell(c: Context<AppEnvironment>): Promise<string | null> {
    shellPromise ??= readShareShell(c).then((text) => {
        if (text === null) shellPromise = null;
        return text;
    });
    return shellPromise;
}

async function readShareShell(c: Context<AppEnvironment>): Promise<string | null> {
    const assets = services(c).staticAssets;
    if (!assets) return null;
    try {
        const response = await assets.fetchShell();
        // 构建产物还没就位（空壳缺失）时是 404，交给调用方回一句 Not Found。
        return response.status === 200 ? await response.text() : null;
    } catch {
        return null;
    }
}

function decodeSegments(path: string): string[] {
    return path
        .split('/')
        .filter((segment) => segment.length > 0)
        .map((segment) => {
            try {
                return decodeURIComponent(segment);
            } catch {
                return segment;
            }
        });
}

function cardShareMeta(
    model: NamecardCardShareResponse,
    origin: string,
    url: string,
): ShareMeta {
    const name = model.card.producerName?.trim() || model.owner.displayName;
    const image = frontImage(model.card.pages, origin);
    return {
        title: `${name}的名片 · IMS`,
        description: `${model.owner.displayName}分享的${name}名片，打开可预览正面。`,
        url,
        siteName: SITE_NAME,
        ...(image ? { image } : {}),
    };
}

function quickShareMeta(
    model: NamecardQuickExchangeResponse,
    origin: string,
    url: string,
): ShareMeta {
    const image = frontImage(model.cards[0]?.pages, origin);
    return {
        title: `${model.displayName}的名片 · IMS`,
        description: `${model.displayName}分享的可交换名片清单，打开可预览。`,
        url,
        siteName: SITE_NAME,
        ...(image ? { image } : {}),
    };
}

/** 分享目标不存在（或被下线）时照常出页面：通用标签 + 200。 */
function genericShareMeta(url: string): ShareMeta {
    return {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        url,
        siteName: SITE_NAME,
    };
}

async function shareMetaFor(
    c: Context<AppEnvironment>,
    origin: string,
    url: string,
): Promise<ShareMeta> {
    // 抓取器不登录，逐卡 `collected` 之类的浏览者视角一律取匿名口径。
    const viewerId = null;
    const repository = namecardRepository(c);
    const segments = decodeSegments(c.req.path);
    if (segments.length === 3 && segments[1] === 'card') {
        const result = await loadCardShareModel(
            c,
            repository,
            segments[2] ?? '',
            viewerId,
        );
        return result.ok ? cardShareMeta(result.model, origin, url) : genericShareMeta(url);
    }
    if (segments.length === 2) {
        const result = await loadQuickExchangeModel(
            c,
            repository,
            segments[1] ?? '',
            viewerId,
        );
        return result.ok ? quickShareMeta(result.model, origin, url) : genericShareMeta(url);
    }
    return genericShareMeta(url);
}

/**
 * 站点分享页的 HTML 出口：`/exchange/card/:slug` 与 `/exchange/:handle` 共用。
 * SPA 空壳 + 按请求现场注入的逐页 OGP 标签（动态路径没法预渲染）。
 */
export async function handleExchangeSharePage(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const shell = await loadShareShell(c);
    if (shell === null) {
        return c.text('Not Found', 404);
    }
    const url = new URL(c.req.url);
    const meta = await shareMetaFor(c, url.origin, url.toString());
    return c.html(injectShareMeta(shell, meta), 200, {
        'Cache-Control': 'public, max-age=300',
    });
}
