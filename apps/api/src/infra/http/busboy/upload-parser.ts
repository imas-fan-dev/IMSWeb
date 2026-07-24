import { Readable, Transform } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import Busboy from 'busboy';
import type { ParsedUpload, UploadParser, UploadedFile } from '@/ports/http';

function uploadError(message: string, status = 400): Error {
    return Object.assign(new Error(message), { status });
}

export class StreamingUploadParser implements UploadParser {
    parse(
        request: Request,
        options: {
            maxBytes: number;
            fileFields: readonly string[];
            maxFiles?: number;
            maxFields?: number;
            maxParts?: number;
        }
    ): Promise<ParsedUpload> {
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
            return Promise.reject(uploadError('multipart/form-data required'));
        }
        const contentLength = Number(request.headers.get('content-length') || '0');
        if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
            return Promise.reject(uploadError('上传文件超过大小限制', 413));
        }
        if (!request.body) return Promise.reject(uploadError('multipart body required'));

        return new Promise((resolve, reject) => {
            const fields: Record<string, string> = {};
            const files: ParsedUpload['files'] = {};
            const acceptedFields = new Set(options.fileFields);
            const parser = Busboy({
                headers: { 'content-type': contentType },
                limits: {
                    fieldSize: options.maxBytes,
                    fileSize: options.maxBytes,
                    files: options.maxFiles ?? 10,
                    fields: options.maxFields ?? 32,
                    parts: options.maxParts ?? 48
                }
            });
            const source = Readable.fromWeb(request.body as NodeReadableStream);
            let settled = false;
            let totalBytes = 0;
            let pendingFiles = 0;

            const fail = (error: unknown): void => {
                if (settled) return;
                settled = true;
                source.destroy();
                parser.destroy();
                reject(error instanceof Error ? error : uploadError(String(error)));
            };

            const counter = new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                    totalBytes += chunk.byteLength;
                    if (totalBytes > options.maxBytes) {
                        callback(uploadError('上传文件超过大小限制', 413));
                    } else callback(null, chunk);
                }
            });

            parser.on('field', (name, value, info) => {
                if (info.valueTruncated) {
                    fail(uploadError('上传文件超过大小限制', 413));
                    return;
                }
                fields[name] = value;
            });
            parser.on('file', (name, stream, info) => {
                if (!acceptedFields.has(name)) {
                    stream.resume();
                    return;
                }
                pendingFiles += 1;
                const chunks: Buffer[] = [];
                stream.on('data', (chunk: Buffer) => chunks.push(chunk));
                stream.on('limit', () => fail(uploadError('上传文件超过大小限制', 413)));
                stream.on('error', fail);
                stream.on('end', () => {
                    pendingFiles -= 1;
                    if (settled) return;
                    const file: UploadedFile = {
                        filename: info.filename,
                        contentType: info.mimeType || 'application/octet-stream',
                        body: new Uint8Array(Buffer.concat(chunks))
                    };
                    const current = files[name];
                    files[name] = current === undefined
                        ? file
                        : Array.isArray(current) ? [...current, file] : [current, file];
                });
            });
            parser.on('error', fail);
            parser.on('filesLimit', () => fail(uploadError('multipart files exceed limit', 413)));
            parser.on('fieldsLimit', () => fail(uploadError('multipart fields exceed limit', 413)));
            parser.on('partsLimit', () => fail(uploadError('multipart parts exceed limit', 413)));
            counter.on('error', fail);
            source.on('error', fail);
            parser.on('finish', () => {
                if (settled) return;
                if (pendingFiles !== 0) {
                    fail(uploadError('multipart stream ended before files completed'));
                    return;
                }
                settled = true;
                resolve({ fields, files });
            });

            source.pipe(counter).pipe(parser);
        });
    }
}
