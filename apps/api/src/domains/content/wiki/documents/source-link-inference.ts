/**
 * Host inference shared by the Enhanced Markdown compiler and the structured
 * exporter.
 *
 * The exporter writes the short `[](...)` source-list form whenever the stored
 * fields match these inferred defaults, so the two modules must agree exactly;
 * keeping the table in one module is what makes that round-trip safe.
 */

/** Source list field separator: fullwidth `｜` first, halfwidth `|` tolerated. */
export const SOURCE_FIELD_SEPARATOR = /[｜|]/;

/** Source platforms the shorthand `[平台｜UP]` form recognizes. */
export const KNOWN_SOURCE_PLATFORMS = new Set([
    'bilibili',
    'bilibili wiki',
    'bwiki',
    'acfun',
    'acfun.cn',
    '其他来源',
]);

export interface InferredSourceFields {
    contentType: string;
    sourcePlatform: string;
    defaultUp: string;
}

export function urlHost(url: string): string | null {
    try {
        return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    } catch {
        return null;
    }
}

/**
 * Host inference for omitted `[类型｜平台｜UP]` fields.
 *
 * Audit coverage: Bilibili video links are `剧情｜Bilibili`, Biligame wiki links
 * are `Wiki｜bilibili wiki`, and everything else (AcFun included) falls back to
 * `剧情｜其他来源`.
 */
export function inferSourceFields(url: string): InferredSourceFields {
    const host = urlHost(url);
    if (host === 'www.bilibili.com' || host === 'bilibili.com') {
        return {
            contentType: '剧情',
            sourcePlatform: 'Bilibili',
            defaultUp: '未知发布者',
        };
    }
    if (host === 'wiki.biligame.com') {
        return {
            contentType: 'Wiki',
            sourcePlatform: 'bilibili wiki',
            defaultUp: 'bwiki',
        };
    }
    return {
        contentType: '剧情',
        sourcePlatform: '其他来源',
        defaultUp: '未知发布者',
    };
}

export function isKnownSourcePlatform(value: string): boolean {
    return KNOWN_SOURCE_PLATFORMS.has(value.trim().toLowerCase());
}
