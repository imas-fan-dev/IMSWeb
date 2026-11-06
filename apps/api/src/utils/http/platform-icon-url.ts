import { platformAccountIconPath } from '@imsweb/contracts/paths';
import type { PlatformAccountKindRecord } from '@/ports/repositories/namecards';

/**
 * 图标统一走站内读取路由（对象存储没有公开地址），带版本号做缓存失效；
 * 未上传时给 null，由前端回退到图标键 / CDN / 首字母。
 */
export function platformAccountIconUrls(
    kinds: PlatformAccountKindRecord[]
): (string | null)[] {
    return kinds.map((kind) =>
        kind.icon_object_key
            ? `${platformAccountIconPath(kind.id)}?v=${encodeURIComponent(kind.updated_at)}`
            : null
    );
}
