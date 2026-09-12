import fsSync, { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { StaticAssets } from "@/ports/http";
import { resolveFrontendRoute } from "@/routing/frontend-route-policy";
import { contentTypeForPath } from "@/utils/http/content-type";
import { parseRange } from "@/utils/http/stored-object-response";

export interface NodeStaticFileIo {
    lstat(filePath: string): Promise<import("node:fs").Stats>;
    createReadStream(
        filePath: string,
        options?: { start?: number; end?: number },
    ): NodeJS.ReadableStream;
}

const defaultIo: NodeStaticFileIo = {
    lstat: (filePath) => fs.lstat(filePath),
    createReadStream: (filePath, options) =>
        createReadStream(filePath, options),
};

const precompressibleExtensions = new Set([
    ".css",
    ".html",
    ".js",
    ".json",
    ".svg",
]);

interface StaticRepresentation {
    filePath: string;
    stat: import("node:fs").Stats;
    encoding?: "br" | "gzip";
}

function acceptedEncodings(value: string | null): Array<"br" | "gzip"> {
    if (!value) return [];
    const qualities = new Map<string, number>();
    for (const item of value.split(",")) {
        const [rawName, ...parameters] = item.trim().toLowerCase().split(";");
        if (!rawName) continue;
        const qualityParameter = parameters.find((parameter) =>
            parameter.trim().startsWith("q="),
        );
        const parsed = qualityParameter
            ? Number(qualityParameter.trim().slice(2))
            : 1;
        qualities.set(
            rawName,
            Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0,
        );
    }
    const wildcard = qualities.get("*") ?? 0;
    return (["br", "gzip"] as const)
        .map((encoding, preference) => ({
            encoding,
            preference,
            quality: qualities.get(encoding) ?? wildcard,
        }))
        .filter((candidate) => candidate.quality > 0)
        .sort(
            (left, right) =>
                right.quality - left.quality ||
                left.preference - right.preference,
        )
        .map((candidate) => candidate.encoding);
}

function appendVary(headers: Headers, value: string): void {
    const current =
        headers
            .get("Vary")
            ?.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean) ?? [];
    if (!current.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
        headers.set("Vary", [...current, value].join(", "));
    }
}

function applyCachePolicy(headers: Headers, key: string): void {
    if (key.endsWith(".html")) {
        headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    } else if (/^assets\/.+-[a-z0-9_-]{8,}\.[a-z0-9]+$/i.test(key)) {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
}

function etag(size: number, mtimeMs: number): string {
    return `"${size.toString(16)}-${Math.trunc(mtimeMs).toString(16)}"`;
}

function weakEtag(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith("W/") ? trimmed.slice(2) : trimmed;
}

function matchesIfNoneMatch(value: string, currentEtag: string): boolean {
    return (
        value.trim() === "*" ||
        value
            .split(",")
            .some((candidate) => weakEtag(candidate) === currentEtag)
    );
}

function unmodifiedSince(value: string, mtimeMs: number): boolean {
    const timestamp = Date.parse(value);
    return (
        Number.isFinite(timestamp) &&
        Math.trunc(mtimeMs / 1000) <= Math.trunc(timestamp / 1000)
    );
}

function isNotModified(
    request: Request,
    currentEtag: string,
    mtimeMs: number,
): boolean {
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch !== null)
        return matchesIfNoneMatch(ifNoneMatch, currentEtag);
    const ifModifiedSince = request.headers.get("if-modified-since");
    return (
        ifModifiedSince !== null && unmodifiedSince(ifModifiedSince, mtimeMs)
    );
}

function permitsRange(
    request: Request,
    currentEtag: string,
    mtimeMs: number,
): boolean {
    const ifRange = request.headers.get("if-range");
    if (ifRange === null) return true;
    const trimmed = ifRange.trim();
    if (trimmed.startsWith("W/")) return false;
    if (trimmed.startsWith('"')) return trimmed === currentEtag;
    return unmodifiedSince(trimmed, mtimeMs);
}

export class NodeStaticAssets implements StaticAssets {
    constructor(
        private readonly publicDir: string,
        private readonly io: NodeStaticFileIo = defaultIo,
    ) {}

    private resolve(key: string): string {
        const candidate = path.resolve(this.publicDir, key);
        const relative = path.relative(this.publicDir, candidate);
        if (
            !relative ||
            relative.startsWith("..") ||
            path.isAbsolute(relative)
        ) {
            throw new Error("Invalid static path");
        }
        let current = this.publicDir;
        for (const segment of relative.split(path.sep)) {
            current = path.join(current, segment);
            try {
                if (fsSync.lstatSync(current).isSymbolicLink())
                    throw new Error("Invalid static path");
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
                throw error;
            }
        }
        return candidate;
    }

    private async selectRepresentation(
        request: Request,
        filePath: string,
        stat: import("node:fs").Stats,
    ): Promise<StaticRepresentation> {
        if (
            request.headers.has("range") ||
            !precompressibleExtensions.has(path.extname(filePath).toLowerCase())
        ) {
            return { filePath, stat };
        }
        for (const encoding of acceptedEncodings(
            request.headers.get("accept-encoding"),
        )) {
            const candidate = `${filePath}${encoding === "br" ? ".br" : ".gz"}`;
            try {
                const candidateStat = await this.io.lstat(candidate);
                if (candidateStat.isFile() && !candidateStat.isSymbolicLink()) {
                    return {
                        filePath: candidate,
                        stat: candidateStat,
                        encoding,
                    };
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT")
                    throw error;
            }
        }
        return { filePath, stat };
    }

    async fetch(request: Request): Promise<Response> {
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Not Found", { status: 404 });
        }
        let key: string;
        try {
            key =
                decodeURIComponent(new URL(request.url).pathname).replace(
                    /^\/+/,
                    "",
                ) || "index.html";
        } catch {
            return new Response("Bad Request", { status: 400 });
        }

        let filePath: string;
        let stat: import("node:fs").Stats;
        try {
            filePath = this.resolve(key);
            stat = await this.io.lstat(filePath);
            if (!stat.isFile() || stat.isSymbolicLink())
                return new Response("Not Found", { status: 404 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return new Response("Not Found", { status: 404 });
            }
            return new Response("Bad Request", { status: 400 });
        }

        let representation: StaticRepresentation;
        try {
            representation = await this.selectRepresentation(
                request,
                filePath,
                stat,
            );
        } catch {
            return new Response("Bad Request", { status: 400 });
        }
        const currentEtag = etag(
            representation.stat.size,
            representation.stat.mtimeMs,
        );
        const headers = new Headers({
            "Accept-Ranges": representation.encoding ? "none" : "bytes",
            "Content-Type": contentTypeForPath(filePath),
            ETag: currentEtag,
            "Last-Modified": representation.stat.mtime.toUTCString(),
        });
        if (
            precompressibleExtensions.has(path.extname(filePath).toLowerCase())
        ) {
            appendVary(headers, "Accept-Encoding");
        }
        applyCachePolicy(headers, key);
        if (representation.encoding)
            headers.set("Content-Encoding", representation.encoding);
        if (isNotModified(request, currentEtag, representation.stat.mtimeMs)) {
            return new Response(null, { status: 304, headers });
        }
        const range = permitsRange(request, currentEtag, stat.mtimeMs)
            ? parseRange(request.headers.get("range"), stat.size)
            : null;
        if (range === "invalid") {
            headers.set("Content-Range", `bytes */${stat.size}`);
            return new Response(null, { status: 416, headers });
        }
        const length = range
            ? range.end - range.start + 1
            : representation.stat.size;
        headers.set("Content-Length", String(length));
        if (range)
            headers.set(
                "Content-Range",
                `bytes ${range.start}-${range.end}/${stat.size}`,
            );
        if (request.method === "HEAD")
            return new Response(null, { status: range ? 206 : 200, headers });

        const stream = this.io.createReadStream(
            representation.filePath,
            range || undefined,
        );
        return new Response(
            Readable.toWeb(
                stream as import("node:stream").Readable,
            ) as ReadableStream,
            {
                status: range ? 206 : 200,
                headers,
            },
        );
    }
}

export function listFrontendFiles(
    directory: string,
    root = directory,
): string[] {
    let entries: fsSync.Dirent[];
    try {
        entries = fsSync.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
    return entries.flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            throw new Error(
                `Frontend asset tree contains a symbolic link: ${absolute}`,
            );
        }
        if (entry.isDirectory()) return listFrontendFiles(absolute, root);
        if (!entry.isFile()) {
            throw new Error(
                `Frontend asset tree contains a non-file: ${absolute}`,
            );
        }
        if (entry.name.endsWith(".br") || entry.name.endsWith(".gz")) return [];
        return [path.relative(root, absolute).split(path.sep).join("/")];
    });
}

function requestUrl(request: Request): URL | null {
    try {
        return new URL(request.url);
    } catch {
        return null;
    }
}

function rewriteFrontendRequest(
    request: Request,
    url: URL,
    assetPath: string,
): Request {
    url.pathname = `/${assetPath}`;
    url.search = "";
    url.hash = "";
    return new Request(url, {
        method: request.method,
        headers: request.headers,
    });
}

export class FrontendStaticAssets implements StaticAssets {
    constructor(
        private readonly assets: StaticAssets,
        private readonly frontendFiles: ReadonlySet<string>,
    ) {}

    async fetch(request: Request): Promise<Response> {
        const url = requestUrl(request);
        if (!url) return new Response("Bad Request", { status: 400 });
        const decision = resolveFrontendRoute(
            {
                method: request.method,
                pathname: url.pathname,
            },
            this.frontendFiles,
        );
        if (decision.kind === "server") return this.assets.fetch(request);
        if (decision.kind === "not-found") {
            return new Response("Not Found", { status: 404 });
        }
        return this.assets.fetch(
            rewriteFrontendRequest(request, url, decision.assetPath),
        );
    }
}
