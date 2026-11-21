import type {
    WikiAdminExportLintWarning,
    WikiAdminExportStructuredStats,
} from '@imsweb/contracts/wiki';
import {
    inferSourceFields,
    urlHost,
} from '@/domains/content/wiki/documents/source-link-inference';

/**
 * Pure structured-to-Enhanced-Markdown exporter.
 *
 * The audit (`data/wiki-audit/wiki-audit-report.md`) is the calibration source:
 * 12,241 live cards show that the card wall — not prose — is the document body,
 * that layout must be inferred from the *shape* of the data rather than from
 * `entryKind` (765PRO's 18 idol entries are all mislabelled `other`), and that
 * only a handful of characters actually break the dialect.
 *
 * The function never touches the database: the caller maps `wiki_story_cards` /
 * `wiki_story_links` rows into the narrow structures below, so every rule here
 * is unit-testable and the export stays strictly read-only.
 */

/** One `wiki_story_links` row as the exporter sees it. */
export interface StructuredExportLink {
    up: string;
    title: string;
    url: string;
    contentType: string;
    sourcePlatform: string;
}

/** One `wiki_story_cards` row plus the links that point at its card id. */
export interface StructuredExportCard {
    id: number;
    title: string;
    subtitle: string;
    fit: 'cover' | 'contain';
    /** Agency shared cover the document dialect can reference as `cover:<id>`. */
    coverAssetId: number | null;
    /**
     * The card has artwork that only exists as a legacy image file, which the
     * document dialect cannot reference; the exporter reports it instead of
     * pretending the card is text-only.
     */
    legacyImage: boolean;
    links: StructuredExportLink[];
}

/** One category of the entry, in display order. */
export interface StructuredExportCategory {
    name: string;
    cards: StructuredExportCard[];
}

/** Everything the exporter needs: the entry's categories in display order. */
export interface StructuredExportInput {
    categories: readonly StructuredExportCategory[];
}

export interface StructuredExportOptions {
    /** Strip the decorative `【…】` shell from card titles (default `false`). */
    stripBrackets?: boolean;
    /** Fold a category block above this card count (default `24`). */
    collapseThreshold?: number;
}

export type StructuredExportResult = {
    markdown: string;
    stats: WikiAdminExportStructuredStats;
    lintWarnings: WikiAdminExportLintWarning[];
};

/** Cards in one category above this count default to folded. */
const DEFAULT_COLLAPSE_THRESHOLD = 24;

/**
 * Entries with this many categories fold every card block: the audit's heaviest
 * page (`百万现场 / 活动剧情`) has 23 categories in one scroll.
 */
const COLLAPSE_CATEGORY_LIMIT = 10;

/** `1-10`, `11-20`, `101-110` — the audit's pure numeric chapter buckets. */
const NUMERIC_BUCKET = /^(\d+)-(\d+)$/u;

/** `出场：A, B` / `出场:A、B` — the audit's S1 cast-list pattern. */
const CAST_PREFIX = /^出场\s*[：:]\s*/u;

/** Cast segments split on halfwidth/fullwidth commas and the enumeration mark. */
const CAST_SEPARATOR = /[,，、]/u;

/** A cast segment that still reads like a name rather than a free remark. */
const CAST_NAME_FORBIDDEN = /[\s()[\]【】「」]/u;
const CAST_NAME_MAX_LENGTH = 12;

/** The audit's single `#` placeholder subtitle. */
const PLACEHOLDER_SUBTITLE = /^[#＃\s]+$/u;

/**
 * UP-name placeholders the audit measured: `bwiki` (1,876 rows, the platform
 * identity rather than an author), `播放列表/合集` and `UP主`.
 */
const PSEUDO_UP_NAMES = new Set(['bwiki', '播放列表/合集', 'UP主']);

/** Search pages are not content pages (one row in the audit). */
const NON_CONTENT_HOSTS = new Set(['search.bilibili.com']);

/** Separator-only differences that produce two near-identical blocks. */
const CATEGORY_SEPARATORS = /[_\-/／・\s]/gu;

/**
 * Attribute values live inside double quotes, so a literal `"` cannot survive.
 * The fullwidth quote keeps the text readable and is what the workbench's
 * authoring macros already do; newlines collapse so one card stays on one line.
 */
function attributeValue(value: string): string {
    return value.replaceAll(/\s+/gu, ' ').replaceAll('"', '”').trim();
}

/**
 * Escapes one `[类型｜平台｜UP]` label field.
 *
 * `\` would start an escape sequence and `]` would close the link text early, so
 * both are backslash-escaped. A bar cannot be escaped at all: the compiler splits
 * the parsed label on both `|` and `｜`, so `\|` would still split and a bar in
 * the type or platform field would silently shift every later field. It becomes
 * the non-separator homoglyph `丨` instead, which keeps the three fields aligned
 * (the audit finds no bar in `category.name` / `card.name` / `link.up`, so this
 * only guards a hand-entered value). `【】`, `「」`, `"`, `*`, `<` and `>` stay
 * literal.
 */
function sourceListLabelField(value: string): string {
    return value
        .replaceAll(/\s+/gu, ' ')
        .trim()
        .replaceAll('\\', '\\\\')
        .replaceAll(']', '\\]')
        .replaceAll(/[|｜]/gu, '丨');
}

/**
 * Keeps a trailing title human-readable while neutralizing `](`.
 *
 * Titles never enter bracket or attribute syntax, so only the two-character
 * sequence that would open a second link needs escaping (2 of 8,073 titles in
 * the audit); everything else — `"`, `【】`, `「」`, `*`, `<`, `>` — stays literal.
 */
function sourceListTitle(value: string): string {
    return value.replaceAll(/\s+/gu, ' ').trim().replaceAll('](', ']\\(');
}

/**
 * `[类型｜平台｜UP]`, or an empty label when the stored fields already match the
 * compiler's host inference.
 *
 * Collapsing to `[](url)` is what folds pseudo UP names such as the 1,876
 * `bwiki` rows into the platform identity: the compiler re-infers exactly the
 * same `Wiki｜bilibili wiki｜bwiki`, so nothing is lost and the source line stays
 * short.
 */
function sourceLabel(link: StructuredExportLink): string {
    const inferred = inferSourceFields(link.url);
    const contentType = link.contentType.trim() || inferred.contentType;
    const sourcePlatform =
        link.sourcePlatform.trim() || inferred.sourcePlatform;
    const up = link.up.trim() || inferred.defaultUp;
    if (
        contentType === inferred.contentType &&
        sourcePlatform === inferred.sourcePlatform &&
        up === inferred.defaultUp
    ) {
        return '';
    }
    return [contentType, sourcePlatform, up]
        .map(sourceListLabelField)
        .join('｜');
}

/** `- [类型｜平台｜UP](url) 标题`. */
function sourceLine(link: StructuredExportLink): string {
    const line = `- [${sourceLabel(link)}](${link.url})`;
    const title = sourceListTitle(link.title);
    return title ? `${line} ${title}` : line;
}

function uniqueTags(tags: readonly string[]): string[] {
    const unique: string[] = [];
    for (const tag of tags) {
        if (tag && !unique.includes(tag)) unique.push(tag);
    }
    return unique;
}

function splitCastList(value: string): string[] {
    return value
        .split(CAST_SEPARATOR)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

function looksLikeCastName(value: string): boolean {
    return (
        value.length <= CAST_NAME_MAX_LENGTH && !CAST_NAME_FORBIDDEN.test(value)
    );
}

interface CardMeta {
    tags: string[];
    subtitle: string;
    placeholder: boolean;
}

/**
 * Splits a `subtitle` into cast tags plus the remaining free remark.
 *
 * Only the two patterns the audit actually found are promoted to `tags="..."`:
 * an explicit `出场：A, B` cast list (164 cards) and an enumeration of short
 * names (68 cards). A single value (327 cards), a space-separated list and a
 * free remark stay in `subtitle="..."`, because a lone value is
 * indistinguishable from a remark and moving it would silently change how the
 * card reads on the public page. The audit's one `#` placeholder is reported and
 * left out of the draft.
 */
function readCardMeta(subtitle: string): CardMeta {
    const trimmed = attributeValue(subtitle);
    if (!trimmed) return { tags: [], subtitle: '', placeholder: false };
    if (PLACEHOLDER_SUBTITLE.test(trimmed)) {
        return { tags: [], subtitle: '', placeholder: true };
    }
    const prefix = CAST_PREFIX.exec(trimmed);
    if (prefix) {
        const tags = uniqueTags(splitCastList(trimmed.slice(prefix[0].length)));
        if (tags.length) return { tags, subtitle: '', placeholder: false };
        return { tags: [], subtitle: trimmed, placeholder: false };
    }
    if (trimmed.includes('、')) {
        const tags = splitCastList(trimmed);
        if (tags.length >= 2 && tags.every(looksLikeCastName)) {
            return {
                tags: uniqueTags(tags),
                subtitle: '',
                placeholder: false,
            };
        }
    }
    return { tags: [], subtitle: trimmed, placeholder: false };
}

/**
 * Card title with the optional `【…】` shell removed.
 *
 * The audit measures that 97.1% of live card names are wrapped in `【】`; the
 * dialect keeps them by default because they are how maintainers read the data,
 * and `stripBrackets: true` is the opt-in for a cleaner document. Only the
 * outermost pair is removed, so `【【初】有村麻央】` becomes `【初】有村麻央`.
 */
function cardTitle(title: string, stripBrackets: boolean): string {
    const value = attributeValue(title);
    if (!stripBrackets) return value;
    if (!value.startsWith('【') || !value.endsWith('】') || value.length <= 2) {
        return value;
    }
    return value.slice(1, -1).trim() || value;
}

/**
 * Whether the card's artwork can be expressed in the dialect at all.
 *
 * Only `asset="cover:<id>"` (and a future `doc:<id>`) reference is renderable, so
 * a card whose artwork is a legacy image file counts as text-only here: counting
 * it as artwork produced grid walls of empty frames. The unreferencable file is
 * reported as `unmapped-card-image` instead of pretending the card has an image.
 */
function cardHasExportableArtwork(card: StructuredExportCard): boolean {
    return card.coverAssetId !== null;
}

/**
 * Infers the container layout from the shape of one category.
 *
 * `entryKind` is deliberately never consulted: 765PRO's 18 idol entries are all
 * labelled `other`, while the zero-link galleries, text-only indexes and 1:1
 * card-to-source lists the audit found cut across every kind. Only *exportable*
 * artwork counts as an image, so a legacy-image category cannot become a grid of
 * empty frames. The precedence is:
 *
 * 1. `list` for a pure text-only category (`img == ""` across cards) — a grid of
 *    empty frames reads badly, a list of titled rows reads like an index;
 * 2. `list` for a 1:1 card-to-source category — fifty rows beat fifty frames;
 * 3. `portrait` for a shared-contain set (the audit's 1,169 vertical cards);
 * 4. `grid` otherwise, which is every zero-link gallery such as 学马仕 `S卡`.
 */
function categoryLayout(
    category: StructuredExportCategory,
): 'list' | 'portrait' | 'grid' {
    const cards = category.cards;
    if (cards.every((card) => !cardHasExportableArtwork(card))) return 'list';
    if (cards.every((card) => card.links.length === 1)) return 'list';
    if (
        cards.every(
            (card) => cardHasExportableArtwork(card) && card.fit === 'contain',
        )
    ) {
        return 'portrait';
    }
    return 'grid';
}

/**
 * Orders categories for export.
 *
 * A category list made entirely of numeric buckets is sorted by its start
 * number, which fixes 百万现场/主线剧情 reading as `1-10`, `101-110`, `11-20`.
 * Any mixed list keeps the maintainer's display order: inventing an order for
 * `白金星光巡游` next to `11-20` would be a guess, not a fix.
 */
function orderedCategories(
    categories: readonly StructuredExportCategory[],
): readonly StructuredExportCategory[] {
    const buckets = categories.map((category) =>
        NUMERIC_BUCKET.exec(category.name.trim()),
    );
    if (buckets.some((bucket) => bucket === null)) return categories;
    return [...categories].sort((left, right) => {
        const leftBucket = NUMERIC_BUCKET.exec(left.name.trim());
        const rightBucket = NUMERIC_BUCKET.exec(right.name.trim());
        const startDifference =
            Number(leftBucket?.[1]) - Number(rightBucket?.[1]);
        if (startDifference) return startDifference;
        const endDifference =
            Number(leftBucket?.[2]) - Number(rightBucket?.[2]);
        if (endDifference) return endDifference;
        return left.name.localeCompare(right.name);
    });
}

function normalizeCategoryName(name: string): string {
    return name.replaceAll(CATEGORY_SEPARATORS, '');
}

function isPseudoUp(value: string): boolean {
    return PSEUDO_UP_NAMES.has(value.trim());
}

function isNonContentUrl(url: string): boolean {
    const host = urlHost(url);
    return host !== null && NON_CONTENT_HOSTS.has(host);
}

/**
 * One card's Markdown lines plus the data-hygiene findings they carry.
 *
 * Findings are collected while the card is rendered, so every warning points at
 * the exact category/card pair a maintainer has to open.
 */
function planCard(
    categoryName: string,
    card: StructuredExportCard,
    options: StructuredExportOptions,
): {
    lines: string[];
    linkCount: number;
    tags: readonly string[];
    warnings: WikiAdminExportLintWarning[];
} {
    const context = `${categoryName} / ${attributeValue(card.title)}`;
    const warnings: WikiAdminExportLintWarning[] = [];
    const meta = readCardMeta(card.subtitle);
    if (meta.placeholder) {
        warnings.push({
            code: 'placeholder-subtitle',
            context,
            message: '副标题只是占位符「#」，草稿中已省略',
        });
    }
    if (card.coverAssetId === null && card.legacyImage) {
        warnings.push({
            code: 'unmapped-card-image',
            context,
            message:
                '卡片插图只存在于旧版图片文件，文档语法无法引用，草稿中已省略插图',
        });
    }
    const attributes = [`id="${card.id}"`];
    const title = cardTitle(card.title, options.stripBrackets === true);
    if (title) attributes.push(`title="${title}"`);
    if (meta.subtitle) attributes.push(`subtitle="${meta.subtitle}"`);
    if (meta.tags.length) attributes.push(`tags="${meta.tags.join(',')}"`);
    if (card.fit === 'contain') attributes.push('fit="contain"');
    if (card.coverAssetId !== null) {
        attributes.push(`asset="cover:${card.coverAssetId}"`);
    }

    const seenUrls = new Set<string>();
    const duplicates: string[] = [];
    const linkLines: string[] = [];
    for (const link of card.links) {
        if (seenUrls.has(link.url)) {
            // A repeated row is dropped, so reporting its other defects would
            // only duplicate the same finding for a line that never ships.
            duplicates.push(link.url);
            continue;
        }
        seenUrls.add(link.url);
        if (isNonContentUrl(link.url)) {
            warnings.push({
                code: 'non-content-url',
                context,
                message: `「${link.url}」是搜索页而不是内容页，草稿仍保留该链接`,
            });
        }
        if (isPseudoUp(link.up)) {
            warnings.push({
                code: 'pseudo-up-name',
                context,
                message: `发布者「${link.up}」是伪 UP 名（平台标识而非作者），草稿仍保留原值`,
            });
        }
        linkLines.push(sourceLine(link));
    }
    for (const url of duplicates) {
        warnings.push({
            code: 'duplicate-url',
            context,
            message: `同一张卡重复引用了「${url}」，草稿只保留第一条`,
        });
    }
    return {
        lines: [`:::card{${attributes.join(' ')}}`, ...linkLines, ':::'],
        linkCount: linkLines.length,
        tags: meta.tags,
        warnings,
    };
}

/** Whether one category block defaults to folded. */
function isCategoryCollapsed(
    cardCount: number,
    categoryCount: number,
    options: StructuredExportOptions,
): boolean {
    const threshold = options.collapseThreshold ?? DEFAULT_COLLAPSE_THRESHOLD;
    return cardCount > threshold || categoryCount >= COLLAPSE_CATEGORY_LIMIT;
}

function planCategory(
    category: StructuredExportCategory,
    categoryCount: number,
    options: StructuredExportOptions,
): {
    lines: string[];
    cards: number;
    links: number;
    collapsed: boolean;
    warnings: WikiAdminExportLintWarning[];
} {
    const cards = category.cards.map((card) =>
        planCard(category.name, card, options),
    );
    const attributes = [`title="${attributeValue(category.name)}"`];
    attributes.push(`layout="${categoryLayout(category)}"`);
    if (cards.some((card) => card.tags.length)) attributes.push('filter="tags"');
    const collapsed = isCategoryCollapsed(
        category.cards.length,
        categoryCount,
        options,
    );
    if (collapsed) attributes.push('collapsed');
    return {
        lines: [
            `:::card-grid{${attributes.join(' ')}}`,
            ...cards.flatMap((card) => card.lines),
            ':::',
        ],
        cards: category.cards.length,
        links: cards.reduce((total, card) => total + card.linkCount, 0),
        collapsed,
        warnings: cards.flatMap((card) => card.warnings),
    };
}

/**
 * Converts an entry's structured card pool into an Enhanced Markdown draft.
 *
 * The result is a *draft*: nothing is saved and no row is written, so a
 * maintainer reviews the generated blocks (and every `lintWarnings` row) before
 * deciding to insert or replace the document source. A category that holds no
 * cards produces no block, but it is reported as `empty-category` — the audit
 * finds 24 such category instances, and dropping their names silently would lose
 * the only thing they still carry.
 */
export function exportStructuredDocument(
    input: StructuredExportInput,
    options: StructuredExportOptions = {},
): StructuredExportResult {
    const categories = orderedCategories(input.categories);
    const blocks: string[] = [];
    const lintWarnings: WikiAdminExportLintWarning[] = [];
    const seenCategoryNames = new Map<string, string>();
    let cards = 0;
    let links = 0;
    let collapsedCategories = 0;
    for (const category of categories) {
        const key = normalizeCategoryName(category.name);
        const earlier = seenCategoryNames.get(key);
        if (earlier === undefined) {
            seenCategoryNames.set(key, category.name);
        } else if (earlier !== category.name) {
            lintWarnings.push({
                code: 'near-duplicate-category',
                context: category.name,
                message: `分类名「${category.name}」与「${earlier}」只差分隔符，导出后会出现两个近似重复的区块`,
            });
        }
        if (!category.cards.length) {
            lintWarnings.push({
                code: 'empty-category',
                context: category.name,
                message: `分类「${category.name}」在该内容页没有任何卡片，草稿中没有对应区块`,
            });
            continue;
        }
        const plan = planCategory(category, categories.length, options);
        blocks.push(plan.lines.join('\n'));
        cards += plan.cards;
        links += plan.links;
        if (plan.collapsed) collapsedCategories += 1;
        lintWarnings.push(...plan.warnings);
    }
    return {
        markdown: blocks.join('\n\n'),
        stats: {
            categories: blocks.length,
            cards,
            links,
            collapsedCategories,
        },
        lintWarnings,
    };
}
