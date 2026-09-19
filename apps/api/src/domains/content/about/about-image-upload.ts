import { publicUploadsPath } from "@imsweb/contracts/paths";
import type { Context } from "hono";
import type { AppEnvironment } from "@/app";
import type { AboutImageUploadRequest } from "@/domains/content/about/request";
import type {
    AboutImageUploadResponse,
    AboutImageUploadSuccessResponse,
    AboutMutationErrorResponse,
} from "@/domains/content/about/response";
import { writeAudit } from "@/domains/admin/audit/write-audit";
import { services } from "@/middleware/hono-context";
import type { UploadParser } from "@/ports/http";
import { randomHex } from "@/utils/crypto/random";
import { messageFromError, statusFromError } from "@/utils/http/error-response";
import { safeUploadBaseName } from "@/utils/media/filename";
import { validateUploadedImage } from "@/utils/media/image-upload";
import { deleteObjectWithCompensation } from "@/utils/storage/delete-object";

interface AboutImageUploadOptions {
    publicDirectory: "hero" | "member-avatars";
    objectKey: (filename: string) => string;
    metadataKind: "about-hero-image" | "about-member-avatar";
    auditAction: string;
    failureMessage: string;
    parseRequest: (uploads: UploadParser) => Promise<AboutImageUploadRequest>;
}

export interface AboutImageUploadResult {
    body: AboutImageUploadResponse;
    status: 200 | 400 | 413 | 500;
}

export async function uploadAboutImage(
    c: Context<AppEnvironment>,
    options: AboutImageUploadOptions,
): Promise<AboutImageUploadResult> {
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error("Upload services unavailable");
    }
    let key = "";
    try {
        const { image: file } = await options.parseRequest(runtime.uploads);
        await validateUploadedImage(file, runtime.images);
        const webp = await runtime.images.toWebp(file.body, 88);
        const filename = `${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.webp`;
        const publicPath = publicUploadsPath(
            `/about/${options.publicDirectory}/${filename}`,
        );
        key = options.objectKey(filename);
        await runtime.storage.put(key, webp, {
            contentType: "image/webp",
            metadata: { kind: options.metadataKind },
        });
        await writeAudit(c, options.auditAction, publicPath);
        return {
            body: {
                success: true,
                url: publicPath,
            } satisfies AboutImageUploadSuccessResponse,
            status: 200,
        };
    } catch (error) {
        if (key) {
            await deleteObjectWithCompensation(runtime, key).catch(
                () => undefined,
            );
        }
        const status = statusFromError(error);
        if (status === 413) {
            return {
                body: {
                    error: "上传文件超过 10MB 限制",
                } satisfies AboutMutationErrorResponse,
                status: 413,
            };
        }
        if (status >= 500) {
            console.error("Failed to upload %s", options.metadataKind, error);
            return {
                body: {
                    error: options.failureMessage,
                } satisfies AboutMutationErrorResponse,
                status: 500,
            };
        }
        return {
            body: {
                error: messageFromError(error),
            } satisfies AboutMutationErrorResponse,
            status: 400,
        };
    }
}
