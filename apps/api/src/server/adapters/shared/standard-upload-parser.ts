import type { ParsedUpload, UploadParser, UploadedFile } from '@/ports/upload-parser';

export class StandardUploadParser implements UploadParser {
    async parse(
        request: Request,
        options: {
            maxBytes: number;
            fileFields: readonly string[];
            maxFiles?: number;
            maxFields?: number;
            maxParts?: number;
        }
    ): Promise<ParsedUpload> {
        const contentLength = Number(request.headers.get('content-length') || '0');
        if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
            throw Object.assign(new Error('上传文件超过大小限制'), { status: 413 });
        }
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
            throw Object.assign(new Error('multipart/form-data required'), { status: 400 });
        }
        if (!request.body) throw Object.assign(new Error('multipart body required'), { status: 400 });
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                received += value.byteLength;
                if (received > options.maxBytes) {
                    await reader.cancel().catch(() => undefined);
                    throw Object.assign(new Error('上传文件超过大小限制'), { status: 413 });
                }
                chunks.push(value);
            }
        } catch (error) {
            if (error && typeof error === 'object' && 'status' in error) throw error;
            throw Object.assign(new Error('multipart stream interrupted'), { status: 400 });
        } finally {
            reader.releaseLock();
        }
        const body = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
        }
        let form: FormData;
        try {
            form = await new Request(request.url, {
                method: 'POST',
                headers: request.headers,
                body: body.buffer
            }).formData();
        } catch {
            throw Object.assign(new Error('invalid multipart body'), { status: 400 });
        }
        const fields: Record<string, string> = {};
        const files: ParsedUpload['files'] = {};
        let fieldCount = 0;
        let fileCount = 0;
        let partCount = 0;
        const maxFields = options.maxFields ?? 32;
        const maxFiles = options.maxFiles ?? 10;
        const maxParts = options.maxParts ?? 48;
        for (const [name, value] of form.entries()) {
            partCount += 1;
            if (partCount > maxParts) {
                throw Object.assign(new Error('multipart parts exceed limit'), { status: 413 });
            }
            if (typeof value === 'string') {
                fieldCount += 1;
                if (fieldCount > maxFields) {
                    throw Object.assign(new Error('multipart fields exceed limit'), { status: 413 });
                }
                fields[name] = value;
                continue;
            }
            fileCount += 1;
            if (fileCount > maxFiles) {
                throw Object.assign(new Error('multipart files exceed limit'), { status: 413 });
            }
            if (!options.fileFields.includes(name)) continue;
            const fileBody = new Uint8Array(await value.arrayBuffer());
            const file: UploadedFile = {
                filename: value.name,
                contentType: value.type || 'application/octet-stream',
                body: fileBody
            };
            const current = files[name];
            files[name] = current === undefined
                ? file
                : Array.isArray(current) ? [...current, file] : [current, file];
        }
        return { fields, files };
    }
}
