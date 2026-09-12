import type { ObjectReadTarget, ObjectStorage } from "@/ports/object-storage";
import { storedObjectResponse } from "@/utils/http/stored-object-response";

export async function objectReadResponse(
    request: Request,
    storage: ObjectStorage,
    key: string,
    extraHeaders?: HeadersInit,
): Promise<Response | null> {
    if (storage.createReadUrl) {
        let target: ObjectReadTarget | null;
        try {
            target = await storage.createReadUrl(key, {
                method: request.method === "HEAD" ? "HEAD" : "GET",
            });
        } catch (error) {
            throw new Error(`Failed to create an object read URL for ${key}`, {
                cause: error,
            });
        }
        if (!target) return null;
        const headers = new Headers(extraHeaders);
        headers.set("Location", target.url);
        if (target.visibility === "private") {
            headers.set("Cache-Control", "private, no-store");
        } else if (!headers.has("Cache-Control")) {
            headers.set("Cache-Control", "public, max-age=300");
        }
        headers.set("Referrer-Policy", "no-referrer");
        return new Response(null, { status: 307, headers });
    }
    try {
        const object = await storage.get(key);
        return object
            ? storedObjectResponse(request, object, extraHeaders)
            : null;
    } catch (error) {
        throw new Error(`Failed to read object ${key}`, { cause: error });
    }
}
