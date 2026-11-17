import type { AppEnvironment } from '@/app';
import type { ValidatedRequestContext } from '@/middleware/request-validation';
import type { UploadParser } from '@/ports/http';
import { adminCatalogMediaRequestSchema } from '@imsweb/contracts/catalog';
import type { FailureMessageResponse } from '@imsweb/contracts/common';

export type CatalogJsonContext<T> = ValidatedRequestContext<AppEnvironment, 'json', T>;

export function catalogValidationError(message: string): FailureMessageResponse {
    return { success: false, message };
}

export async function parseCatalogImageRequest(request: Request, uploads: UploadParser, maxBytes: number) {
    const upload = await uploads.parse(request, {
        maxBytes, fileFields: ['image'], maxFiles: 1, maxFields: 1, maxParts: 2,
    });
    let raw: unknown;
    try { raw = JSON.parse(upload.fields.metadata ?? ''); }
    catch { throw Object.assign(new Error('图片参数无效'), { status: 400 }); }
    const result = adminCatalogMediaRequestSchema.safeParse(raw);
    if (!result.success) throw Object.assign(new Error('图片参数无效'), { status: 400 });
    const file = upload.files.image;
    if (Array.isArray(file)) throw Object.assign(new Error('只允许上传一张图片'), { status: 400 });
    return { input: result.data, file };
}
