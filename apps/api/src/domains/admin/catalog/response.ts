import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { FailureMessageResponse } from '@imsweb/contracts/common';
import type { AdminCatalogProfile } from '@imsweb/contracts/catalog';
import type { CatalogProfileRecord } from '@/ports/repositories/catalog';
import type { ObjectStorage } from '@/ports/object-storage';
import { adminApiPath } from '@imsweb/contracts/paths';

export function catalogError(
    c: Context<AppEnvironment>,
    error: unknown,
): Response {
    const value = error as {
        status?: number;
        code?: string;
        constraint?: string;
        message?: string;
    };
    const status =
        value.status === 401
            ? 401
            : value.status === 413
              ? 413
              : value.status === 404
                ? 404
                : value.status === 400 ||
                    value.code === '23503' ||
                    value.code === '23514'
                  ? 400
                  : value.status === 409 || value.code === '23505'
                    ? 409
                    : 500;
    const message =
        status === 500
            ? '资料库操作失败'
            : value.constraint === 'wiki_entries_effective_name_key'
              ? '内容页名称或旧定位名已被占用，请使用其他企划内名称'
              : value.constraint === 'catalog_characters_project_name_key'
                ? '此企划已有同名人物默认档案'
                : value.constraint ===
                    'catalog_characters_fallback_category_key'
                  ? '此分类已有通用兜底选项'
                  : value.code === '23505'
                    ? '目标档案已有内容条目，请先解除原绑定'
                    : (value.message ?? '资料参数无效');
    return c.json(
        { success: false, message } satisfies FailureMessageResponse,
        status,
    );
}

export async function catalogProfileView(
    profile: CatalogProfileRecord,
    storage: ObjectStorage | undefined,
    kind: 'character' | 'group',
): Promise<AdminCatalogProfile> {
    const { imageObjectKey, ...record } = profile;
    return {
        ...record,
        imageUrl: imageObjectKey
            ? ((await storage?.createPublicReadUrl?.(imageObjectKey)) ??
              `${adminApiPath(`/catalog/profile-images/${kind}/${profile.id}`)}?v=${profile.mediaRevision}`)
            : null,
    };
}
