import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { UploadedFile } from '@/ports/http';
import { services } from '@/middleware/hono-context';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';
import { trimmedText } from '@/utils/validation/text';

export interface NewsSubmission {
    title: string;
    content: string;
    coverUrl?: string;
    file?: UploadedFile;
}

export function validateNewsSubmission(
    value: unknown,
    file?: UploadedFile
): NewsSubmission {
    const body = requestRecord(value, '资讯标题或链接无效');
    const title = trimmedText(body.title, { maximumLength: 300 });
    if (!title) invalidRequest('资讯标题或链接无效');
    const content = trimmedText(body.content, { maximumLength: 4096 });
    if (!content) invalidRequest('资讯标题或链接无效');
    let url: URL;
    try {
        url = new URL(content);
    } catch {
        invalidRequest('资讯链接无效');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.href.length > 4096) {
        invalidRequest('资讯标题或链接无效');
    }
    let coverUrl: string | undefined;
    if (body.coverUrl !== undefined && body.coverUrl !== '') {
        coverUrl = trimmedText(body.coverUrl, { maximumLength: 4096 }) ?? undefined;
        if (!coverUrl) invalidRequest('B站封面地址无效');
    }
    return { title, content: url.href, ...(coverUrl ? { coverUrl } : {}), ...(file ? { file } : {}) };
}

export async function parseNewsSubmission(c: Context<AppEnvironment>): Promise<NewsSubmission> {
    const runtime = services(c);
    const contentType = c.req.header('content-type') || '';
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
        if (!runtime.uploads) throw new Error('Upload parser unavailable');
        const parsed = await runtime.uploads.parse(c.req.raw, {
            maxBytes: 10 * 1024 * 1024 + 128 * 1024,
            fileFields: ['image'],
            maxFiles: 1,
            maxFields: 4,
            maxParts: 5
        });
        const value = parsed.files.image;
        if (Array.isArray(value) && value.length > 1) {
            throw Object.assign(new Error('只能上传一张图片'), { status: 400 });
        }
        return validateNewsSubmission({
            title: parsed.fields.title,
            content: parsed.fields.content,
            coverUrl: parsed.fields.cover_url
        }, Array.isArray(value) ? value[0] : value);
    }
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        throw Object.assign(new Error('资讯标题或链接无效'), { status: 400 });
    }
    return validateNewsSubmission(body);
}
