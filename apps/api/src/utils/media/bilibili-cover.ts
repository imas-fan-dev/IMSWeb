import type { UploadedFile } from '@/ports/http';
import { normalizedImageMime } from '@/utils/media/image-upload';

const BILIBILI_IMAGE_HOST = /^i\d+\.hdslb\.com$/i;
const IMAGE_EXTENSIONS: Record<string, string> = {
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
};

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

export function normalizeBilibiliCoverUrl(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
        const url = new URL(value.trim());
        if (url.protocol === 'http:') url.protocol = 'https:';
        if (
            url.protocol !== 'https:' || url.port || url.username || url.password ||
            !BILIBILI_IMAGE_HOST.test(url.hostname) || !url.pathname.startsWith('/bfs/')
        ) {
            return '';
        }
        url.hash = '';
        return url.href;
    } catch {
        return '';
    }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw badRequest('B站封面图片过大');
    }
    if (!response.body) return new Uint8Array();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
            await reader.cancel();
            throw badRequest('B站封面图片过大');
        }
        chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

export async function fetchBilibiliCover(
    value: unknown,
    fetchImpl: typeof globalThis.fetch,
    maxBytes = 10 * 1024 * 1024,
    timeoutMs = 5000
): Promise<UploadedFile> {
    const url = normalizeBilibiliCoverUrl(value);
    if (!url) throw badRequest('B站封面地址无效');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let response: Response;
        try {
            response = await fetchImpl(url, {
                headers: {
                    Referer: 'https://www.bilibili.com/',
                    'User-Agent': 'Mozilla/5.0'
                },
                redirect: 'error',
                signal: controller.signal
            });
        } catch {
            throw badRequest('B站封面获取失败');
        }
        if (!response.ok) throw badRequest('B站封面获取失败');

        const contentType = normalizedImageMime(response.headers.get('content-type') || '');
        const extension = IMAGE_EXTENSIONS[contentType];
        if (!extension) throw badRequest('B站封面格式不支持');
        const body = await readLimitedBody(response, maxBytes);
        if (!body.byteLength) throw badRequest('B站封面内容为空');
        return {
            filename: `bilibili-cover.${extension}`,
            contentType,
            body
        };
    } finally {
        clearTimeout(timeout);
    }
}
