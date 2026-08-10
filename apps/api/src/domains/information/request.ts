import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    MAX_INFORMATION_IMAGE_BYTES,
    oneInformationFile,
    type InformationSubmission
} from '@/domains/information/content-store';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestInput } from '@/middleware/request-validation';
import type { UploadedFile } from '@/ports/http';
import { validateUploadedImage } from '@/utils/media/image-upload';
import { invalidRequest, requestRecord } from '@/utils/validation/request-data';

export interface InformationCardParams {
    id: string;
}

export interface UploadInformationAssetRequest {
    image: UploadedFile;
}

export type InformationCardRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', InformationCardParams>
>;

export type UpdateInformationRequestContext = Context<
    AppEnvironment,
    string,
    ValidatedRequestInput<'param', InformationCardParams> &
    ValidatedRequestInput<'json', InformationSubmission>
>;

export function validateInformationCardParams(value: unknown): InformationCardParams {
    const params = requestRecord(value, '活动内容 ID 无效');
    return { id: String(params.id ?? '') };
}

export async function parseUploadInformationAssetRequest(
    c: Context<AppEnvironment>
): Promise<UploadInformationAssetRequest> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images) {
        throw new Error('Upload services unavailable');
    }
    const parsed = await runtime.uploads.parse(c.req.raw, {
        maxBytes: MAX_INFORMATION_IMAGE_BYTES + 64 * 1024,
        fileFields: ['image'],
        maxFiles: 1,
        maxFields: 1,
        maxParts: 2
    });
    const image = oneInformationFile(parsed.files.image);
    if (!image || image.body.byteLength > MAX_INFORMATION_IMAGE_BYTES) {
        invalidRequest('必须上传一张不超过 10MB 的图片');
    }
    await validateUploadedImage(image, runtime.images);
    return { image };
}
