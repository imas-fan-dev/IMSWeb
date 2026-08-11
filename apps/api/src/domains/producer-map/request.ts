import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { services } from '@/middleware/hono-context';
import type { UploadedFile } from '@/ports/http';
import { invalidRequest } from '@/utils/validation/request-data';

const MAX_PRODUCER_MAP_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ProducerMapImageUploadRequest {
    image: UploadedFile;
}

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    if (!value || Array.isArray(value)) return null;
    return value;
}

export async function parseProducerMapImageUploadRequest(
    c: Context<AppEnvironment>
): Promise<ProducerMapImageUploadRequest> {
    const runtime = services(c);
    if (!runtime.uploads) {
        throw new Error('Upload services unavailable');
    }
    const parsed = await runtime.uploads.parse(c.req.raw, {
        maxBytes: MAX_PRODUCER_MAP_IMAGE_BYTES + 64 * 1024,
        fileFields: ['image'],
        maxFiles: 1,
        maxFields: 0,
        maxParts: 1
    });
    const image = oneFile(parsed.files.image);
    if (!image || image.body.byteLength > MAX_PRODUCER_MAP_IMAGE_BYTES) {
        invalidRequest('必须上传一张不超过 10MB 的图片');
    }
    return { image };
}
