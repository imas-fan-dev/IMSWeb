import type {
    WikiDocumentAssetRef,
    WikiDocumentBlock,
    WikiDocumentCard,
    WikiDocumentCardRatio,
    WikiDocumentHeading,
    WikiDocumentInline,
    WikiDocumentListItem,
    WikiDocumentSourceLink,
    WikiDocumentTab,
    WikiDocumentWarning,
    WikiPublicStoryDocument,
} from '@imsweb/contracts/wiki';

import {
    inferSourceFields,
    isKnownSourcePlatform,
    SOURCE_FIELD_SEPARATOR,
} from '@/domains/content/wiki/documents/source-link-inference';

/**
 * Pure server-side Enhanced Markdown compiler.
 *
 * The dialect is CommonMark + GFM plus the `:::` container directives and the
 * `::` leaf directives this feature ships. Raw HTML is dropped with a line
 * numbered warning and never reaches the AST, so public clients can render the
 * tree without an HTML sanitiser or `dangerouslySetInnerHTML`.
 *
 * Image assets and structured categories are parsed into *references* here: the
 * compiler never touches the database, so membership is verified by the caller
 * through `assetRefs` / `categoryRefs` (kept beside the AST together with their
 * source lines, which the AST itself does not carry).
 *
 * The parser stack is ESM-only, and the API server builds to CommonJS, so the
 * processor is imported lazily once and reused for every compile.
 */

/** One `asset="cover:<id>"` / `asset="doc:<id>"` reference and its source line. */
export interface WikiDocumentAssetSite {
    line: number;
    asset: WikiDocumentAssetRef;
}

/** One named `::story-category{name="..."}` reference and its source line. */
export interface WikiDocumentCategorySite {
    line: number;
    name: string;
}

export interface EnhancedMarkdownCompileResult {
    document: WikiPublicStoryDocument;
    plainText: string;
    warnings: WikiDocumentWarning[];
    /** Image references in document order; resolved against the database later. */
    assetRefs: WikiDocumentAssetSite[];
    /** Named category embeddings in document order; verified against the entry. */
    categoryRefs: WikiDocumentCategorySite[];
}

/** Structural subset of mdast used by the compiler. */
interface MarkdownNode {
    type: string;
    value?: string | null;
    children?: MarkdownNode[];
    depth?: number;
    ordered?: boolean | null;
    start?: number | null;
    align?: Array<'left' | 'center' | 'right' | null> | null;
    name?: string | null;
    attributes?: Record<string, string | null> | null;
    url?: string | null;
    position?: { start?: { line?: number } };
}

interface MarkdownProcessor {
    parse(markdown: string): MarkdownNode;
}

const CALLOUT_TONES = ['tip', 'info', 'warning', 'spoiler'] as const;
type CalloutTone = (typeof CALLOUT_TONES)[number];

/** Only absolute http(s) URLs and site-relative paths are renderable. */
const SAFE_URL = /^(?:https?:\/\/|\/(?!\/))/i;

const SLUG_EDGE = /(^-+)|(-+$)/g;
const SLUG_UNSAFE = /[^a-z0-9\u4e00-\u9fff]+/g;

let processorPromise: Promise<MarkdownProcessor> | undefined;

function loadProcessor(): Promise<MarkdownProcessor> {
    processorPromise ??= (async () => {
        const [unifiedModule, parseModule, gfmModule, directiveModule] =
            await Promise.all([
                import('unified'),
                import('remark-parse'),
                import('remark-gfm'),
                import('remark-directive'),
            ]);
        return unifiedModule
            .unified()
            .use(parseModule.default)
            .use(gfmModule.default)
            .use(directiveModule.default) as unknown as MarkdownProcessor;
    })();
    return processorPromise;
}

function lineOf(node: MarkdownNode): number {
    return node.position?.start?.line ?? 1;
}

const DIRECTIVE_OPENER = /^(:{3,})([a-zA-Z][\w-]*)(.*)$/;
const DIRECTIVE_CLOSER = /^:{3,}\s*$/;
const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Rewrites container fences so nestable `:::` blocks parse the way authors
 * write them.
 *
 * `remark-directive` closes every open container whose fence is not longer than
 * the closing fence, so `:::card-grid` wrapping `:::card` only nests when the
 * outer fence has more colons. The dialect keeps one `:::` closer per opening
 * container (innermost first) and rewrites the fences to strictly decreasing
 * lengths, which makes the documented syntax work without teaching authors the
 * colon-count rule. Fenced code blocks are skipped so their content is literal.
 */
function normalizeDirectiveFences(markdown: string): string {
    const lines = markdown.split('\n');
    const openerDepth = new Map<number, number>();
    const closers = new Map<number, number>();
    const openers: number[] = [];
    let codeFence: { character: string; length: number } | null = null;
    for (const [index, line] of lines.entries()) {
        const fenceMatch = CODE_FENCE.exec(line);
        if (codeFence) {
            const closesCodeFence =
                fenceMatch !== null &&
                fenceMatch[1][0] === codeFence.character &&
                fenceMatch[1].length >= codeFence.length &&
                fenceMatch[2].trim() === '';
            if (closesCodeFence) codeFence = null;
            continue;
        }
        if (fenceMatch) {
            codeFence = {
                character: fenceMatch[1][0],
                length: fenceMatch[1].length,
            };
            continue;
        }
        if (DIRECTIVE_OPENER.test(line)) {
            openerDepth.set(index, openers.length);
            openers.push(index);
            continue;
        }
        if (DIRECTIVE_CLOSER.test(line)) {
            const opener = openers.pop();
            if (opener !== undefined) closers.set(index, opener);
        }
    }
    if (!openerDepth.size) return markdown;
    const maxDepth = Math.max(...openerDepth.values());
    const fenceFor = (depth: number): string =>
        ':'.repeat(3 + maxDepth - depth);
    for (const [index, depth] of openerDepth) {
        const match = DIRECTIVE_OPENER.exec(lines[index]);
        if (!match) continue;
        lines[index] = `${fenceFor(depth)}${match[2]}${match[3]}`;
    }
    for (const [index, opener] of closers) {
        lines[index] = fenceFor(openerDepth.get(opener) ?? 0);
    }
    return lines.join('\n');
}

function slugify(text: string): string {
    const slug = text
        .toLowerCase()
        .replace(SLUG_UNSAFE, '-')
        .replace(SLUG_EDGE, '');
    return slug || 'section';
}

class CompileContext {
    readonly warnings: WikiDocumentWarning[] = [];
    readonly assetRefs: WikiDocumentAssetSite[] = [];
    readonly categoryRefs: WikiDocumentCategorySite[] = [];
    private readonly usedAnchors = new Set<string>();

    warn(line: number, code: string, message: string): void {
        this.warnings.push({ line, code, message });
    }

    warnAt(node: MarkdownNode, code: string, message: string): void {
        this.warn(lineOf(node), code, message);
    }

    /**
     * Unique in-page anchor. Uniqueness is checked against the final id set, so
     * a document containing `A`, `A` and `A-2` yields `a`, `a-2` and `a-3`
     * instead of two `a-2` anchors.
     */
    headingAnchor(text: string): string {
        const base = slugify(text);
        if (!this.usedAnchors.has(base)) {
            this.usedAnchors.add(base);
            return base;
        }
        const family = base.replace(/-\d+$/, '');
        let suffix = 2;
        let candidate = `${family}-${suffix}`;
        while (this.usedAnchors.has(candidate)) {
            suffix += 1;
            candidate = `${family}-${suffix}`;
        }
        this.usedAnchors.add(candidate);
        return candidate;
    }
}

/** `:::details{open}` accepts only the documented boolean spellings. */
function parseBooleanAttribute(value: string | null | undefined): boolean | null {
    if (value === undefined) return false;
    if (value === null || value === '') return true;
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return null;
}

/**
 * Flattens mdast inline nodes to plain text.
 *
 * Used for the source-list label and its trailing title, where the author wrote
 * literal text: raw-looking `<...>` sequences stay literal text instead of
 * being rejected as HTML, because titles such as `【中字】<生肉>` are data here.
 */
function markdownInlineText(nodes: readonly MarkdownNode[]): string {
    return nodes
        .map((node) => {
            switch (node.type) {
                case 'text':
                case 'inlineCode':
                case 'html':
                    return node.value ?? '';
                case 'break':
                    return ' ';
                default:
                    return node.children
                        ? markdownInlineText(node.children)
                        : '';
            }
        })
        .join('');
}

/**
 * Resolves `[类型｜平台｜UP]` segments, falling back to host inference.
 *
 * Three explicit segments always win; two segments are read as `[类型｜UP]`
 * unless the first one names a known platform, which makes it `[平台｜UP]`.
 */
function resolveSourceFields(
    label: string,
    url: string,
): { contentType: string; sourcePlatform: string; up: string } {
    const inferred = inferSourceFields(url);
    const trimmed = label.trim();
    const parts =
        trimmed === ''
            ? []
            : trimmed.split(SOURCE_FIELD_SEPARATOR).map((part) => part.trim());
    if (parts.length >= 3) {
        return {
            contentType: parts[0] || inferred.contentType,
            sourcePlatform: parts[1] || inferred.sourcePlatform,
            up: parts.slice(2).join('｜') || inferred.defaultUp,
        };
    }
    if (parts.length === 2) {
        const [first, second] = parts;
        if (isKnownSourcePlatform(first)) {
            return {
                contentType: '剧情',
                sourcePlatform: first,
                up: second || inferred.defaultUp,
            };
        }
        return {
            contentType: first || inferred.contentType,
            sourcePlatform: inferred.sourcePlatform,
            up: second || inferred.defaultUp,
        };
    }
    return {
        contentType: inferred.contentType,
        sourcePlatform: inferred.sourcePlatform,
        up: parts[0] || inferred.defaultUp,
    };
}

/** One `- [类型｜平台｜UP](url) 可选标题` list item. */
function sourceLinkFromItem(
    node: MarkdownNode,
    context: CompileContext,
): WikiDocumentSourceLink | null {
    const paragraph = node.children?.[0];
    if (node.type !== 'listItem' || paragraph?.type !== 'paragraph') {
        context.warnAt(
            node,
            'invalid-source-item',
            '来源列表项必须是 - [类型｜平台｜UP](url) 标题',
        );
        return null;
    }
    const inlines = paragraph.children ?? [];
    const linkIndex = inlines.findIndex((inline) => inline.type === 'link');
    if (linkIndex < 0) {
        context.warnAt(
            node,
            'invalid-source-item',
            '来源列表项缺少 [文字](url) 链接',
        );
        return null;
    }
    const linkNode = inlines[linkIndex];
    const url = linkNode.url ?? '';
    if (!SAFE_URL.test(url)) {
        context.warnAt(
            linkNode,
            'unsafe-url-blocked',
            '已移除不安全的来源地址',
        );
        return null;
    }
    const fields = resolveSourceFields(
        markdownInlineText(linkNode.children ?? []),
        url,
    );
    return {
        up: fields.up,
        title: markdownInlineText(inlines.slice(linkIndex + 1)).trim(),
        url,
        contentType: fields.contentType,
        sourcePlatform: fields.sourcePlatform,
    };
}

/** Collects the source list items of a `:::links` / `:::card` body. */
function collectSourceLinks(
    directive: MarkdownNode,
    context: CompileContext,
): WikiDocumentSourceLink[] {
    const links: WikiDocumentSourceLink[] = [];
    for (const child of directive.children ?? []) {
        if (child.type !== 'list') {
            context.warnAt(
                child,
                'invalid-directive',
                '来源块内只能使用 - [类型｜平台｜UP](url) 标题 形式的列表项',
            );
            continue;
        }
        for (const item of child.children ?? []) {
            const link = sourceLinkFromItem(item, context);
            if (link) links.push(link);
        }
    }
    return links;
}

function pushText(nodes: WikiDocumentInline[], value: string): void {
    if (!value) return;
    const last = nodes.at(-1);
    if (last?.type === 'text') {
        last.value += value;
        return;
    }
    nodes.push({ type: 'text', value });
}

function inlineText(nodes: readonly WikiDocumentInline[]): string {
    return nodes
        .map((node) => {
            switch (node.type) {
                case 'text':
                case 'inlineCode':
                    return node.value;
                case 'strong':
                case 'emphasis':
                case 'delete':
                case 'link':
                    return inlineText(node.children);
                case 'break':
                    return ' ';
                default:
                    return '';
            }
        })
        .join('');
}

function convertInline(
    nodes: readonly MarkdownNode[],
    context: CompileContext,
): WikiDocumentInline[] {
    const output: WikiDocumentInline[] = [];
    for (const node of nodes) {
        switch (node.type) {
            case 'text':
                pushText(output, node.value ?? '');
                break;
            case 'strong':
                output.push({
                    type: 'strong',
                    children: convertInline(node.children ?? [], context),
                });
                break;
            case 'emphasis':
                output.push({
                    type: 'emphasis',
                    children: convertInline(node.children ?? [], context),
                });
                break;
            case 'delete':
                output.push({
                    type: 'delete',
                    children: convertInline(node.children ?? [], context),
                });
                break;
            case 'inlineCode':
                output.push({ type: 'inlineCode', value: node.value ?? '' });
                break;
            case 'link': {
                const url = node.url ?? '';
                const children = convertInline(node.children ?? [], context);
                if (!SAFE_URL.test(url)) {
                    context.warnAt(
                        node,
                        'unsafe-url-blocked',
                        '已移除不安全的链接地址',
                    );
                    for (const child of children) {
                        if (child.type === 'text') pushText(output, child.value);
                        else output.push(child);
                    }
                    break;
                }
                output.push({ type: 'link', url, children });
                break;
            }
            case 'break':
                output.push({ type: 'break' });
                break;
            case 'html':
                context.warnAt(node, 'raw-html-rejected', '已移除原生 HTML');
                break;
            default:
                context.warnAt(
                    node,
                    'unsupported-node',
                    `已跳过不支持的 Markdown 语法：${node.type}`,
                );
        }
    }
    return output;
}

/** `collapsed` is a bare attribute or an explicit boolean spelling. */
function parseCollapsedAttribute(
    node: MarkdownNode,
    attributes: Record<string, string | null>,
    context: CompileContext,
): boolean {
    const collapsed = parseBooleanAttribute(attributes.collapsed);
    if (collapsed === null) {
        context.warnAt(
            node,
            'invalid-directive',
            `不支持的 collapsed 取值：${attributes.collapsed ?? ''}`,
        );
        return false;
    }
    return collapsed;
}

function convertLinksDirective(
    node: MarkdownNode,
    attributes: Record<string, string | null>,
    context: CompileContext,
): WikiDocumentBlock[] {
    const links = collectSourceLinks(node, context);
    if (!links.length) {
        context.warnAt(
            node,
            'empty-directive',
            ':::links 未包含有效的来源列表项',
        );
        return [];
    }
    return [
        {
            type: 'links',
            title: attributes.title ?? '',
            collapsed: parseCollapsedAttribute(node, attributes, context),
            links,
        },
    ];
}

const CARD_LAYOUTS = ['grid', 'portrait', 'banner', 'list'] as const;
const CARD_RATIOS = ['16/9', '4/5', '9/16', '1/1', '2.8/1'] as const;
const CARD_COLUMNS = { min: 2, max: 6 } as const;

/**
 * Reads one enumerated directive attribute, warning on unknown values.
 *
 * `fallback: null` marks the attribute as optional, so one helper serves both
 * the required (`layout`, `fit`) and optional (`ratio`, `filter`) attributes.
 */
function parseEnumAttribute<T extends string>(
    node: MarkdownNode,
    attribute: string,
    value: string | null | undefined,
    allowed: readonly T[],
    fallback: T | null,
    context: CompileContext,
): T | null {
    if (value === undefined) return fallback;
    if (value !== null && (allowed as readonly string[]).includes(value)) {
        return value as T;
    }
    context.warnAt(
        node,
        'invalid-directive',
        `不支持的 ${attribute} 取值：${value ?? ''}`,
    );
    return fallback;
}

function parseCardColumns(
    node: MarkdownNode,
    value: string | null | undefined,
    context: CompileContext,
): number | null {
    if (value === undefined) return null;
    const trimmed = value?.trim() ?? '';
    if (/^\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (parsed >= CARD_COLUMNS.min && parsed <= CARD_COLUMNS.max) {
            return parsed;
        }
    }
    context.warnAt(
        node,
        'invalid-directive',
        `不支持的 card-grid.cols 取值：${value ?? ''}`,
    );
    return null;
}

function parseCardId(
    node: MarkdownNode,
    value: string | null | undefined,
    context: CompileContext,
): number | null {
    if (value === undefined) return null;
    const trimmed = value?.trim() ?? '';
    if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) return Number(trimmed);
    context.warnAt(
        node,
        'invalid-directive',
        `不支持的 card.id 取值：${value ?? ''}`,
    );
    return null;
}

/** `tags="a,b"` — halfwidth/fullwidth commas, trimmed, de-duplicated in order. */
function parseCardTags(value: string | null | undefined): string[] {
    if (!value) return [];
    const tags: string[] = [];
    for (const part of value.split(/[,，]/)) {
        const tag = part.trim();
        if (tag && !tags.includes(tag)) tags.push(tag);
    }
    return tags;
}

/** `asset="cover:<id>"` / `asset="doc:<id>"`. */
const ASSET_REFERENCE = /^(cover|doc):(\d+)$/;

/**
 * Parses one image asset reference and records it with its source line.
 *
 * Unreadable values warn and resolve to `null`, so the caller either drops the
 * whole block (`::media`) or keeps a text-only card (`:::card`).
 */
function parseAssetReference(
    node: MarkdownNode,
    value: string | null | undefined,
    context: CompileContext,
): WikiDocumentAssetRef | null {
    const match = ASSET_REFERENCE.exec((value ?? '').trim());
    const id = Number(match?.[2]);
    if (!match || !Number.isSafeInteger(id) || id <= 0) {
        context.warnAt(
            node,
            'invalid-directive',
            `不支持的图片素材引用：${value ?? ''}`,
        );
        return null;
    }
    const asset: WikiDocumentAssetRef = {
        kind: match[1] as WikiDocumentAssetRef['kind'],
        id,
    };
    context.assetRefs.push({ line: lineOf(node), asset });
    return asset;
}

/** `::media{asset="..." caption="..." fit="cover|contain"}`. */
function convertMediaDirective(
    node: MarkdownNode,
    attributes: Record<string, string | null>,
    context: CompileContext,
): WikiDocumentBlock[] {
    const asset = parseAssetReference(node, attributes.asset, context);
    if (!asset) return [];
    return [
        {
            type: 'media',
            asset,
            caption: attributes.caption ?? '',
            fit:
                parseEnumAttribute(
                    node,
                    'media.fit',
                    attributes.fit,
                    ['cover', 'contain'] as const,
                    'cover',
                    context,
                ) ?? 'cover',
            imageUrl: null,
            presentationPolicy: 'inherit',
        },
    ];
}

/**
 * `::story-category{name="..." collapsed}` and `::story-categories`.
 *
 * A named embedding records its line so the caller can warn when the entry has
 * no such category; `::story-categories` embeds the whole pool.
 */
function convertStoryCategoryDirective(
    node: MarkdownNode,
    attributes: Record<string, string | null>,
    context: CompileContext,
    all: boolean,
): WikiDocumentBlock[] {
    const collapsed = parseCollapsedAttribute(node, attributes, context);
    if (all) {
        if (attributes.name !== undefined) {
            context.warnAt(
                node,
                'invalid-directive',
                '::story-categories 不接受 name 属性',
            );
        }
        return [{ type: 'storyCategory', categoryName: null, collapsed }];
    }
    const name = (attributes.name ?? '').trim();
    if (!name) {
        context.warnAt(
            node,
            'invalid-directive',
            '::story-category 需要 name 属性',
        );
        return [];
    }
    context.categoryRefs.push({ line: lineOf(node), name });
    return [{ type: 'storyCategory', categoryName: name, collapsed }];
}

function convertCardDirective(
    node: MarkdownNode,
    attributes: Record<string, string | null>,
    context: CompileContext,
): WikiDocumentCard {
    return {
        type: 'card',
        id: parseCardId(node, attributes.id, context),
        title: attributes.title ?? '',
        subtitle: attributes.subtitle ?? '',
        fit:
            parseEnumAttribute(
                node,
                'card.fit',
                attributes.fit,
                ['cover', 'contain'] as const,
                'cover',
                context,
            ) ?? 'cover',
        asset:
            attributes.asset === undefined
                ? null
                : parseAssetReference(node, attributes.asset, context),
        imageUrl: null,
        presentationPolicy: 'inherit',
        tags: parseCardTags(attributes.tags),
        links: collectSourceLinks(node, context),
    };
}

function convertCardGridDirective(
    node: MarkdownNode,
    attributes: Record<string, string | null>,
    context: CompileContext,
): WikiDocumentBlock[] {
    const layout = parseEnumAttribute(
        node,
        'card-grid.layout',
        attributes.layout,
        CARD_LAYOUTS,
        'grid',
        context,
    ) ?? 'grid';
    const cols = parseCardColumns(node, attributes.cols, context);
    const ratio = parseEnumAttribute<WikiDocumentCardRatio>(
        node,
        'card-grid.ratio',
        attributes.ratio,
        CARD_RATIOS,
        null,
        context,
    );
    const filter = parseEnumAttribute(
        node,
        'card-grid.filter',
        attributes.filter,
        ['tags'] as const,
        null,
        context,
    );
    const collapsed = parseCollapsedAttribute(node, attributes, context);
    const cards: WikiDocumentCard[] = [];
    for (const child of node.children ?? []) {
        if (child.type === 'containerDirective' && child.name === 'card') {
            cards.push(
                convertCardDirective(child, child.attributes ?? {}, context),
            );
            continue;
        }
        context.warnAt(
            child,
            'invalid-directive',
            ':::card-grid 内只能包含 :::card',
        );
    }
    if (!cards.length) {
        context.warnAt(
            node,
            'empty-directive',
            ':::card-grid 未包含有效的 :::card',
        );
        return [];
    }
    return [
        {
            type: 'cardGrid',
            layout,
            cols,
            ratio,
            filter,
            collapsed,
            title: attributes.title ?? '',
            cards,
        },
    ];
}

function convertTabsDirective(
    node: MarkdownNode,
    context: CompileContext,
): WikiDocumentBlock[] {
    const items: WikiDocumentTab[] = [];
    for (const child of node.children ?? []) {
        if (child.type === 'containerDirective' && child.name === 'tab') {
            items.push({
                type: 'tab',
                title: child.attributes?.title ?? '',
                children: convertBlocks(child.children ?? [], context, false),
            });
            continue;
        }
        context.warnAt(child, 'invalid-directive', ':::tabs 内只能包含 :::tab');
    }
    if (!items.length) {
        context.warnAt(
            node,
            'empty-directive',
            ':::tabs 未包含有效的 :::tab',
        );
        return [];
    }
    return [{ type: 'tabs', items }];
}

function convertBlock(
    node: MarkdownNode,
    context: CompileContext,
    collectHeading: boolean,
    headings: WikiDocumentHeading[],
): WikiDocumentBlock[] {
    switch (node.type) {
        case 'heading': {
            const children = convertInline(node.children ?? [], context);
            const text = inlineText(children).trim();
            const depth = node.depth ?? 2;
            if (depth === 1 || depth > 3) {
                context.warnAt(
                    node,
                    'heading-level-normalized',
                    depth === 1
                        ? '一级标题已降级为二级标题'
                        : '深层标题已归一为三级标题',
                );
            }
            const level = depth <= 2 ? 2 : 3;
            const id = context.headingAnchor(text);
            if (collectHeading) headings.push({ id, level, text });
            return [{ type: 'heading', level, id, children }];
        }
        case 'paragraph': {
            const children = convertInline(node.children ?? [], context);
            if (!children.length) return [];
            return [{ type: 'paragraph', children }];
        }
        case 'blockquote':
            return [
                {
                    type: 'blockquote',
                    children: convertBlocks(
                        node.children ?? [],
                        context,
                        false,
                    ),
                },
            ];
        case 'list': {
            const items: WikiDocumentListItem[] = (node.children ?? []).map(
                (item) => ({
                    children: convertBlocks(
                        item.children ?? [],
                        context,
                        false,
                    ),
                }),
            );
            return [
                {
                    type: 'list',
                    ordered: Boolean(node.ordered),
                    start: node.ordered ? (node.start ?? 1) : null,
                    items,
                },
            ];
        }
        case 'table': {
            const [headerRow, ...bodyRows] = node.children ?? [];
            return [
                {
                    type: 'table',
                    align: (node.align ?? []).map((align) => align ?? null),
                    header: (headerRow?.children ?? []).map((cell) =>
                        convertInline(cell.children ?? [], context),
                    ),
                    rows: bodyRows.map((row) =>
                        (row.children ?? []).map((cell) =>
                            convertInline(cell.children ?? [], context),
                        ),
                    ),
                },
            ];
        }
        case 'thematicBreak':
            return [{ type: 'thematicBreak' }];
        case 'containerDirective': {
            const name = node.name ?? '';
            const attributes = node.attributes ?? {};
            if (name === 'links') {
                return convertLinksDirective(node, attributes, context);
            }
            if (name === 'card-grid') {
                return convertCardGridDirective(node, attributes, context);
            }
            if (name === 'tabs') {
                return convertTabsDirective(node, context);
            }
            if (name === 'card') {
                context.warnAt(
                    node,
                    'invalid-directive',
                    ':::card 必须位于 :::card-grid 内',
                );
                return [];
            }
            if (name === 'tab') {
                context.warnAt(
                    node,
                    'invalid-directive',
                    ':::tab 必须位于 :::tabs 内',
                );
                return [];
            }
            const children = convertBlocks(
                node.children ?? [],
                context,
                false,
            );
            if (name === 'callout') {
                const requested = attributes.type;
                const isKnownTone =
                    typeof requested === 'string' &&
                    (CALLOUT_TONES as readonly string[]).includes(requested);
                if (typeof requested === 'string' && !isKnownTone) {
                    context.warnAt(
                        node,
                        'invalid-directive',
                        `不支持的 callout 类型：${requested}`,
                    );
                }
                return [
                    {
                        type: 'callout',
                        tone: isKnownTone ? (requested as CalloutTone) : 'info',
                        title: attributes.title ?? '',
                        children,
                    },
                ];
            }
            if (name === 'details') {
                const parsedOpen = parseBooleanAttribute(attributes.open);
                if (parsedOpen === null) {
                    context.warnAt(
                        node,
                        'invalid-directive',
                        `不支持的 details.open 取值：${attributes.open ?? ''}`,
                    );
                }
                return [
                    {
                        type: 'details',
                        title: attributes.title ?? '',
                        open: parsedOpen === true,
                        children,
                    },
                ];
            }
            context.warnAt(
                node,
                'invalid-directive',
                `未知的指令容器：${name}`,
            );
            return children;
        }
        case 'leafDirective': {
            const name = node.name ?? '';
            const attributes = node.attributes ?? {};
            if (name === 'media') {
                return convertMediaDirective(node, attributes, context);
            }
            if (name === 'story-category') {
                return convertStoryCategoryDirective(
                    node,
                    attributes,
                    context,
                    false,
                );
            }
            if (name === 'story-categories') {
                return convertStoryCategoryDirective(
                    node,
                    attributes,
                    context,
                    true,
                );
            }
            context.warnAt(
                node,
                'invalid-directive',
                `暂不支持的指令：${name}`,
            );
            return [];
        }
        case 'textDirective':
            context.warnAt(
                node,
                'invalid-directive',
                `暂不支持的指令：${node.name ?? ''}`,
            );
            return [];
        case 'html':
            context.warnAt(node, 'raw-html-rejected', '已移除原生 HTML');
            return [];
        default:
            context.warnAt(
                node,
                'unsupported-node',
                `已跳过不支持的 Markdown 语法：${node.type}`,
            );
            return [];
    }
}

function convertBlocks(
    nodes: readonly MarkdownNode[],
    context: CompileContext,
    collectHeading: boolean,
    headings: WikiDocumentHeading[] = [],
): WikiDocumentBlock[] {
    const output: WikiDocumentBlock[] = [];
    for (const node of nodes) {
        output.push(...convertBlock(node, context, collectHeading, headings));
    }
    return output;
}

function sourceLinkLines(
    links: readonly WikiDocumentSourceLink[],
): string[] {
    return links
        .map((link) =>
            [link.contentType, link.sourcePlatform, link.up, link.title]
                .filter((part) => part.length > 0)
                .join(' '),
        )
        .filter((line) => line.length > 0);
}

function blockPlainLines(blocks: readonly WikiDocumentBlock[]): string[] {
    const lines: string[] = [];
    for (const block of blocks) {
        switch (block.type) {
            case 'heading':
            case 'paragraph':
                lines.push(inlineText(block.children).trim());
                break;
            case 'blockquote':
            case 'callout':
            case 'details':
                lines.push(...blockPlainLines(block.children));
                break;
            case 'list':
                for (const item of block.items) {
                    lines.push(...blockPlainLines(item.children));
                }
                break;
            case 'table':
                for (const row of [block.header, ...block.rows]) {
                    lines.push(
                        row
                            .map((cell) => inlineText(cell).trim())
                            .join(' ')
                            .trim(),
                    );
                }
                break;
            case 'links':
                if (block.title) lines.push(block.title);
                lines.push(...sourceLinkLines(block.links));
                break;
            case 'cardGrid':
                if (block.title) lines.push(block.title);
                for (const card of block.cards) {
                    const cardLine = [card.title, card.subtitle]
                        .filter((part) => part.length > 0)
                        .join(' ');
                    if (cardLine) lines.push(cardLine);
                    if (card.tags.length) lines.push(card.tags.join(' '));
                    lines.push(...sourceLinkLines(card.links));
                }
                break;
            case 'tabs':
                for (const tab of block.items) {
                    if (tab.title) lines.push(tab.title);
                    lines.push(...blockPlainLines(tab.children));
                }
                break;
            case 'media':
                if (block.caption) lines.push(block.caption);
                break;
            case 'storyCategory':
                if (block.categoryName) lines.push(block.categoryName);
                break;
            default:
                break;
        }
    }
    return lines.filter((line) => line.length > 0);
}

/** Deduplicated card tags in document order, used by the public tag facets. */
function collectAvailableTags(blocks: readonly WikiDocumentBlock[]): string[] {
    const tags: string[] = [];
    const visit = (blockList: readonly WikiDocumentBlock[]): void => {
        for (const block of blockList) {
            switch (block.type) {
                case 'cardGrid':
                    for (const card of block.cards) {
                        for (const tag of card.tags) {
                            if (!tags.includes(tag)) tags.push(tag);
                        }
                    }
                    break;
                case 'tabs':
                    for (const tab of block.items) visit(tab.children);
                    break;
                case 'blockquote':
                case 'callout':
                case 'details':
                    visit(block.children);
                    break;
                case 'list':
                    for (const item of block.items) visit(item.children);
                    break;
                default:
                    break;
            }
        }
    };
    visit(blocks);
    return tags;
}

/**
 * Compiles Enhanced Markdown into the versioned public document AST.
 *
 * Warnings are authoring diagnostics for the admin workbench; they never block
 * a save and are never exposed to public readers.
 */
export async function compileEnhancedMarkdown(
    markdown: string,
): Promise<EnhancedMarkdownCompileResult> {
    const processor = await loadProcessor();
    const context = new CompileContext();
    const headings: WikiDocumentHeading[] = [];
    const root = processor.parse(normalizeDirectiveFences(markdown));
    const blocks = convertBlocks(root.children ?? [], context, true, headings);
    return {
        document: {
            version: 1,
            headings,
            availableTags: collectAvailableTags(blocks),
            blocks,
        },
        plainText: blockPlainLines(blocks).join('\n'),
        warnings: context.warnings,
        assetRefs: context.assetRefs,
        categoryRefs: context.categoryRefs,
    };
}
