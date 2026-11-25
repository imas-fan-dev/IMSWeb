export interface StaticAssets {
    fetch(request: Request): Promise<Response>;
    /**
     * 站点空壳（`__spa-fallback.html`）的原始字节，供 OGP 注入这类 HTML 出口用。
     *
     * 前端路由策略按契约拒绝「按路径直取 `.html`」（未登记的路径一律 404），
     * 所以这里直接取文件、不过策略；同时不带任何请求头，避免内容协商把
     * `.br` / `.gz` 变体当成正文返回。
     */
    fetchShell(): Promise<Response>;
}

export interface UploadedFile {
    filename: string;
    contentType: string;
    body: Uint8Array;
}

export interface ParsedUpload {
    fields: Record<string, string>;
    files: Record<string, UploadedFile | UploadedFile[] | undefined>;
}

export interface UploadParser {
    parse(
        request: Request,
        options: {
            maxBytes: number;
            fileFields: readonly string[];
            maxFiles?: number;
            maxFields?: number;
            maxParts?: number;
        }
    ): Promise<ParsedUpload>;
}

export interface HttpServices {
    staticAssets: StaticAssets;
    uploads: UploadParser;
}
