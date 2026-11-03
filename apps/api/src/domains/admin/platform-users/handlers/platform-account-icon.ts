import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import { services } from "@/middleware/hono-context";
import type { UploadedFile } from "@/ports/http";
import { randomHex } from "@/utils/crypto/random";
import { deleteObjectWithCompensation } from "@/utils/storage/delete-object";

const MAX_ICON_BYTES = 512 * 1024;

/**
 * Marks have to keep their transparent background, so only formats that can
 * carry an alpha channel are accepted. JPEG is deliberately absent.
 */
const ALPHA_FORMATS: Record<string, string> = {
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "image/svg+xml": "svg",
};

const KIND_ID = /^[a-z0-9-]{1,32}$/;

function oneFile(value: UploadedFile | UploadedFile[] | undefined): UploadedFile | null {
    return value && !Array.isArray(value) ? value : null;
}

export function platformAccountIconKey(kindId: string, extension: string): string {
    return `platform/account-kinds/${kindId}/icon.${extension}`;
}

export async function handleUploadPlatformAccountIcon(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.storage) {
        throw new Error("Upload services unavailable");
    }
    const kindId = c.req.param("id") ?? "";
    if (!KIND_ID.test(kindId)) {
        return c.json({ success: false, message: "平台标识符无效" }, 400);
    }
    const kinds = await services(c).namecards?.listPlatformAccountKinds();
    const kind = kinds?.find((entry) => entry.id === kindId);
    if (!kind) {
        return c.json({ success: false, message: "平台不存在" }, 404);
    }
    const upload = await runtime.uploads.parse(c.req.raw, {
        maxBytes: MAX_ICON_BYTES + 64 * 1024,
        fileFields: ["icon"],
        maxFiles: 1,
        maxFields: 0,
        maxParts: 1,
    });
    const file = oneFile(upload.files.icon);
    if (!file) {
        return c.json({ success: false, message: "必须上传一个图标文件" }, 400);
    }
    const extension = ALPHA_FORMATS[file.contentType];
    if (!extension) {
        return c.json(
            {
                success: false,
                message: "只支持带透明通道的 PNG、WebP、AVIF、GIF 或 SVG",
            },
            400
        );
    }
    const key = platformAccountIconKey(kindId, extension);
    const ownerToken = randomHex(32);
    await runtime.storage.put(key, file.body, {
        contentType: file.contentType,
        ownerToken,
        metadata: { kind: "platform-account-icon", platform: kindId },
    });
    const saved = await services(c).namecards!.setPlatformAccountKindIcon(kindId, key);
    if (!saved) {
        return c.json({ success: false, message: "平台不存在" }, 404);
        }
    // The key is fixed per platform, so the previous object is this same key.
    await deleteObjectWithCompensation(runtime, key).catch((error) => {
        console.error("Failed to schedule replaced platform icon cleanup", error);
    });
    return c.json({ success: true, iconObjectKey: key });
}
