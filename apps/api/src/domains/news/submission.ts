import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { UploadedFile } from '@/ports/http';
import { services } from '@/middleware/hono-context';

export interface NewsSubmission {
    title?: unknown;
    content?: unknown;
    coverUrl?: unknown;
    file?: UploadedFile;
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
        return {
            title: parsed.fields.title,
            content: parsed.fields.content,
            coverUrl: parsed.fields.cover_url,
            file: Array.isArray(value) ? value[0] : value
        };
    }
    try {
        return await c.req.json<NewsSubmission>();
    } catch {
        throw Object.assign(new Error('资讯标题或链接无效'), { status: 400 });
    }
}
