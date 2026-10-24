import type { UploadParser, UploadedFile } from '@/ports/http';
import {
    chronicleFiles,
    safeChronicleSegment
} from '@/domains/content/chronicle/chronicle-records';
import {
    invalidRequest,
    requestRecord
} from '@/utils/validation/request-data';

const MAX_CHRONICLE_FILE_BYTES = 5 * 1024 * 1024;

export interface ChronicleActivityParams {
    activityId: string;
}

export interface ChronicleMediaParams {
    activityId: string;
    filename: string;
}

export interface ChronicleUploadRequest {
    activityId: string;
    username: string;
    uploads: UploadedFile[];
}

export function validateChronicleActivityParams(value: unknown): ChronicleActivityParams {
    const params = requestRecord(value, 'activityId is invalid');
    return {
        activityId: safeChronicleSegment(params.id, 'activityId')
    };
}

export function validateChronicleMediaParams(value: unknown): ChronicleMediaParams {
    const params = requestRecord(value, 'Chronicle media path is invalid');
    return {
        activityId: safeChronicleSegment(params.activityId, 'activityId'),
        filename: safeChronicleSegment(params.filename, 'filename')
    };
}

export async function parseChronicleUploadRequest(
    request: Request,
    uploads: UploadParser
): Promise<ChronicleUploadRequest> {
    const parsed = await uploads.parse(request, {
        maxBytes: 25 * 1024 * 1024 + 256 * 1024,
        fileFields: ['images'],
        maxFiles: 5,
        maxFields: 8,
        maxParts: 13
    });
    const activityId = safeChronicleSegment(parsed.fields.activityId || '0', 'activityId');
    const username = (parsed.fields.username || '匿名')
        .replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || '匿名';
    const files = chronicleFiles(parsed.files.images);
    if (!files.length || files.length > 5) {
        invalidRequest('最多上传5张图片');
    }
    if (files.some((file) => file.body.byteLength > MAX_CHRONICLE_FILE_BYTES)) {
        invalidRequest('文件过大');
    }
    return { activityId, username, uploads: files };
}
