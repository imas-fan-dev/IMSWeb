import fsSync, { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { StaticAssets } from '@/ports/static-assets';
import { parseRange } from '@/shared/stored-object-response';
import { contentTypeForPath } from '@/adapters/node/filesystem-object-storage';

export interface NodeStaticFileIo {
    lstat(filePath: string): Promise<import('node:fs').Stats>;
    createReadStream(
        filePath: string,
        options?: { start?: number; end?: number }
    ): NodeJS.ReadableStream;
}

const defaultIo: NodeStaticFileIo = {
    lstat: (filePath) => fs.lstat(filePath),
    createReadStream: (filePath, options) => createReadStream(filePath, options)
};

function etag(size: number, mtimeMs: number): string {
    return `"${size.toString(16)}-${Math.trunc(mtimeMs).toString(16)}"`;
}

export class NodeStaticAssets implements StaticAssets {
    constructor(
        private readonly publicDir: string,
        private readonly io: NodeStaticFileIo = defaultIo
    ) {}

    private resolve(key: string): string {
        const candidate = path.resolve(this.publicDir, key);
        const relative = path.relative(this.publicDir, candidate);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('Invalid static path');
        }
        let current = this.publicDir;
        for (const segment of relative.split(path.sep)) {
            current = path.join(current, segment);
            try {
                if (fsSync.lstatSync(current).isSymbolicLink()) throw new Error('Invalid static path');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
                throw error;
            }
        }
        return candidate;
    }

    async fetch(request: Request): Promise<Response> {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return new Response('Not Found', { status: 404 });
        }
        let key: string;
        try {
            key = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '') || 'index.html';
        } catch {
            return new Response('Bad Request', { status: 400 });
        }

        let filePath: string;
        let stat: import('node:fs').Stats;
        try {
            filePath = this.resolve(key);
            stat = await this.io.lstat(filePath);
            if (!stat.isFile() || stat.isSymbolicLink()) return new Response('Not Found', { status: 404 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return new Response('Not Found', { status: 404 });
            }
            return new Response('Bad Request', { status: 400 });
        }

        const headers = new Headers({
            'Accept-Ranges': 'bytes',
            'Content-Type': contentTypeForPath(filePath),
            'ETag': etag(stat.size, stat.mtimeMs),
            'Last-Modified': stat.mtime.toUTCString()
        });
        const range = parseRange(request.headers.get('range'), stat.size);
        if (range === 'invalid') {
            headers.set('Content-Range', `bytes */${stat.size}`);
            return new Response(null, { status: 416, headers });
        }
        const length = range ? range.end - range.start + 1 : stat.size;
        headers.set('Content-Length', String(length));
        if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
        if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });

        const stream = this.io.createReadStream(filePath, range || undefined);
        return new Response(Readable.toWeb(stream as import('node:stream').Readable) as ReadableStream, {
            status: range ? 206 : 200,
            headers
        });
    }
}
