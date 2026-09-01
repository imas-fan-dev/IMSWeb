import { isFudabaMapStyleUrl } from '@imsweb/contracts/fudaba/map-delivery';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';

const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface FudabaMapSourceWriteRequest {
    name: string;
    styleUrl: string;
    revision: string | null;
}

export interface FudabaMapSourceActivationRequest {
    sourceId: string;
    revision: string | null;
}

export interface FudabaMapSourceDeleteRequest {
    revision: string | null;
}

function unprocessable(message: string): never {
    throw Object.assign(new Error(message), { status: 422 });
}

async function requestBody(
    c: Context<AppEnvironment>,
): Promise<Record<string, unknown>> {
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        unprocessable('请求正文必须为 JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        unprocessable('请求正文必须为 JSON 对象');
    }
    return body as Record<string, unknown>;
}

function revision(value: unknown): string | null {
    if (value !== null && typeof value !== 'string') {
        unprocessable('地图源 revision 格式无效');
    }
    return value;
}

function sourceId(value: unknown): string {
    if (
        typeof value !== 'string' ||
        value.length > 80 ||
        !SOURCE_ID_PATTERN.test(value)
    ) {
        unprocessable('地图源 ID 格式无效');
    }
    return value;
}

export function parseFudabaMapSourceId(c: Context<AppEnvironment>): string {
    return sourceId(c.req.param('sourceId'));
}

export async function parseFudabaMapSourceWriteRequest(
    c: Context<AppEnvironment>,
): Promise<FudabaMapSourceWriteRequest> {
    const body = await requestBody(c);
    const keys = Object.keys(body);
    if (
        keys.length !== 3 ||
        !keys.includes('name') ||
        !keys.includes('styleUrl') ||
        !keys.includes('revision')
    ) {
        unprocessable('地图源请求格式无效');
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const styleUrl =
        typeof body.styleUrl === 'string' ? body.styleUrl.trim() : '';
    if (!name || name.length > 80 || /[\0-\x1f\x7f]/.test(name)) {
        unprocessable('地图源名称格式无效');
    }
    if (!isFudabaMapStyleUrl(styleUrl)) {
        unprocessable('地图样式地址格式无效');
    }
    return { name, styleUrl, revision: revision(body.revision) };
}

export async function parseFudabaMapSourceActivationRequest(
    c: Context<AppEnvironment>,
): Promise<FudabaMapSourceActivationRequest> {
    const body = await requestBody(c);
    const keys = Object.keys(body);
    if (
        keys.length !== 2 ||
        !keys.includes('sourceId') ||
        !keys.includes('revision')
    ) {
        unprocessable('地图源激活请求格式无效');
    }
    return {
        sourceId: sourceId(body.sourceId),
        revision: revision(body.revision),
    };
}

export async function parseFudabaMapSourceDeleteRequest(
    c: Context<AppEnvironment>,
): Promise<FudabaMapSourceDeleteRequest> {
    const body = await requestBody(c);
    const keys = Object.keys(body);
    if (keys.length !== 1 || !keys.includes('revision')) {
        unprocessable('地图源删除请求格式无效');
    }
    return { revision: revision(body.revision) };
}
