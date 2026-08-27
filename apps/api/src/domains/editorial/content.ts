import { generateHTML, generateJSON } from '@tiptap/html/server';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import sanitizeHtml from 'sanitize-html';
import { invalidRequest } from '@/utils/validation/request-data';

const allowedNodes = new Set([
    'doc', 'paragraph', 'heading', 'text', 'bold', 'italic', 'strike', 'underline',
    'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule',
    'hardBreak', 'link', 'image'
]);

const extensions = [
    StarterKit.configure({
        codeBlock: false,
        heading: { levels: [2, 3] },
        link: { openOnClick: false }
    }),
    Image.configure({ allowBase64: false })
];

export interface ArticleImageReference {
    assetId: number;
    src: string;
}

export const emptyArticleDocument: Record<string, unknown> = {
    type: 'doc',
    content: []
};

function walk(value: unknown, images: ArticleImageReference[]): void {
    if (Array.isArray(value)) {
        value.forEach((item) => walk(item, images));
        return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.type === 'string' && !allowedNodes.has(record.type)) {
        invalidRequest(`正文包含不支持的节点: ${record.type}`);
    }
    if (record.type === 'image') {
        const attrs = record.attrs;
        if (!attrs || typeof attrs !== 'object') invalidRequest('正文图片缺少素材信息');
        const imageAttrs = attrs as Record<string, unknown>;
        const assetId = Number(imageAttrs.assetId);
        const src = typeof imageAttrs.src === 'string' ? imageAttrs.src : '';
        if (!Number.isSafeInteger(assetId) || assetId <= 0 || !src) {
            invalidRequest('正文图片必须引用已上传素材');
        }
        if (src.startsWith('data:') || !src.startsWith('/uploads/articles/')) {
            invalidRequest('正文图片只能使用当前站点素材');
        }
        images.push({ assetId, src });
    }
    if (record.type === 'link') {
        const href = (record.attrs as Record<string, unknown> | undefined)?.href;
        if (typeof href !== 'string' || !/^(?:https?:\/\/|\/)/i.test(href)) {
            invalidRequest('链接只允许 HTTP(S) 或站内路径');
        }
    }
    Object.values(record).forEach((child) => walk(child, images));
}

export function validateArticleBody(value: unknown): {
    document: Record<string, unknown>;
    images: ArticleImageReference[];
} {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        invalidRequest('正文格式无效');
    }
    const document = value as Record<string, unknown>;
    if (document.type !== 'doc') invalidRequest('正文根节点必须是 doc');
    const images: ArticleImageReference[] = [];
    walk(document, images);
    return { document, images };
}

export function renderArticleBody(document: Record<string, unknown>): string {
    const html = generateHTML(document as Parameters<typeof generateHTML>[0], extensions);
    return sanitizeHtml(html, {
        allowedTags: [
            'p', 'h2', 'h3', 'strong', 'em', 's', 'u', 'ol', 'ul', 'li', 'blockquote',
            'hr', 'br', 'a', 'img'
        ],
        allowedAttributes: {
            a: ['href', 'target', 'rel'],
            img: ['src', 'alt', 'title']
        },
        allowedSchemes: ['http', 'https'],
        allowProtocolRelative: false,
        transformTags: {
            a: (_tagName, attribs) => {
                const next: Record<string, string> = {
                    ...attribs,
                    rel: 'nofollow noopener noreferrer'
                };
                if (attribs.target === '_blank') next.target = '_blank';
                else delete next.target;
                return { tagName: 'a', attribs: next };
            }
        }
    });
}

export function legacyHtmlToArticleDocument(html: string): Record<string, unknown> {
    const compatibleHtml = sanitizeHtml(html, {
        transformTags: {
            img: (_tagName, attribs): {
                tagName: string;
                attribs: Record<string, string>;
                text: string;
            } => {
                const src = typeof attribs.src === 'string' ? attribs.src.trim() : '';
                const alt = typeof attribs.alt === 'string' ? attribs.alt.trim() : '';
                const text = alt ? `查看图片：${alt}` : '查看图片';
                if (src && /^(?:https?:\/\/|\/(?!\/))/i.test(src)) {
                    return {
                        tagName: 'a',
                        attribs: { href: src },
                        text
                    };
                }
                return {
                    tagName: 'span',
                    attribs: { title: '图片地址无效' },
                    text: alt ? `[图片：${alt}]` : '[图片已省略]'
                };
            }
        }
    });
    const document = generateJSON(compatibleHtml, extensions) as Record<string, unknown>;
    return validateArticleBody(document).document;
}
