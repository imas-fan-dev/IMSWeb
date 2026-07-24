export interface StaticAssets {
    fetch(request: Request): Promise<Response>;
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
