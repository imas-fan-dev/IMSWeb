import type {
    WikiDocumentBlock,
    WikiDocumentHeading,
    WikiDocumentInline,
    WikiDocumentListItem,
    WikiDocumentWarning,
    WikiPublicStoryDocument,
} from '@imsweb/contracts/wiki';

/**
 * Pure server-side Enhanced Markdown compiler.
 *
 * The dialect is CommonMark + GFM plus the `:::` container directives this
 * ticket ships (`:::callout`, `:::details`). Raw HTML is dropped with a line
 * numbered warning and never reaches the AST, so public clients can render the
 * tree without an HTML sanitiser or `dangerouslySetInnerHTML`.
 *
 * The parser stack is ESM-only, and the API server builds to CommonJS, so the
 * processor is imported lazily once and reused for every compile.
 */

export interface EnhancedMarkdownCompileResult {
    document: WikiPublicStoryDocument;
    plainText: string;
    warnings: WikiDocumentWarning[];
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

function slugify(text: string): string {
    const slug = text
        .toLowerCase()
        .replace(SLUG_UNSAFE, '-')
        .replace(SLUG_EDGE, '');
    return slug || 'section';
}

class CompileContext {
    readonly warnings: WikiDocumentWarning[] = [];
    private readonly usedAnchors = new Map<string, number>();

    warn(line: number, code: string, message: string): void {
        this.warnings.push({ line, code, message });
    }

    warnAt(node: MarkdownNode, code: string, message: string): void {
        this.warn(lineOf(node), code, message);
    }

    headingAnchor(text: string): string {
        const base = slugify(text);
        const seen = this.usedAnchors.get(base) ?? 0;
        this.usedAnchors.set(base, seen + 1);
        return seen === 0 ? base : `${base}-${seen + 1}`;
    }
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
            const children = convertBlocks(
                node.children ?? [],
                context,
                false,
            );
            if (name === 'callout') {
                const requested = attributes.type;
                const tone: CalloutTone =
                    typeof requested === 'string' &&
                    (CALLOUT_TONES as readonly string[]).includes(requested)
                        ? (requested as CalloutTone)
                        : 'info';
                if (
                    typeof requested === 'string' &&
                    !(CALLOUT_TONES as readonly string[]).includes(requested)
                ) {
                    context.warnAt(
                        node,
                        'invalid-directive',
                        `不支持的 callout 类型：${requested}`,
                    );
                }
                return [
                    {
                        type: 'callout',
                        tone,
                        title: attributes.title ?? '',
                        children,
                    },
                ];
            }
            if (name === 'details') {
                return [
                    {
                        type: 'details',
                        title: attributes.title ?? '',
                        open:
                            Object.hasOwn(attributes, 'open') &&
                            attributes.open !== 'false',
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
        case 'leafDirective':
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
            default:
                break;
        }
    }
    return lines.filter((line) => line.length > 0);
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
    const root = processor.parse(markdown);
    const blocks = convertBlocks(root.children ?? [], context, true, headings);
    return {
        document: {
            version: 1,
            headings,
            availableTags: [],
            blocks,
        },
        plainText: blockPlainLines(blocks).join('\n'),
        warnings: context.warnings,
    };
}
