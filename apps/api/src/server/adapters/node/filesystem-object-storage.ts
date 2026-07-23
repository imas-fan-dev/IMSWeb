import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';

const CONTENT_TYPES: Record<string, string> = {
    '.avif': 'image/avif', '.bmp': 'image/bmp', '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
    '.jfif': 'image/jpeg', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2'
};

export function contentTypeForPath(filePath: string): string {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function contentTypeForObject(key: string, filePath: string): string {
    return key.replace(/^\/+/, '').startsWith('uploads/news/thumb/')
        ? 'image/png'
        : contentTypeForPath(filePath);
}

function checksum(body: Uint8Array): string {
    return crypto.createHash('sha256').update(body).digest('hex');
}

export interface FilesystemStorageRoots {
    publicDir: string;
    uploadsDir: string;
    chronicleDir: string;
    storyDataDir: string;
}

export class FilesystemObjectStorage implements ObjectStorage {
    private readonly mutationQueues = new Map<string, Promise<void>>();

    constructor(private readonly roots: FilesystemStorageRoots) {}

    private async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.mutationQueues.get(key) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => { release = resolve; });
        const queued = previous.catch(() => undefined).then(() => current);
        this.mutationQueues.set(key, queued);
        await previous.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
            if (this.mutationQueues.get(key) === queued) this.mutationQueues.delete(key);
        }
    }

    private resolveKey(key: string): string {
        const normalized = key.replace(/^\/+/, '').replace(/\\/g, '/');
        const segments = normalized.split('/');
        if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
            throw new Error('Invalid object key');
        }

        let root = this.roots.publicDir;
        let relative = normalized;
        if (normalized.startsWith('uploads/')) {
            root = this.roots.uploadsDir;
            relative = normalized.slice('uploads/'.length);
        } else if (normalized.startsWith('assets/images/eventchronicle/events/')) {
            root = this.roots.chronicleDir;
            relative = normalized.slice('assets/images/eventchronicle/events/'.length);
        } else if (normalized.startsWith('Data/')) {
            root = this.roots.storyDataDir;
            relative = normalized.slice('Data/'.length);
        }
        const candidate = path.resolve(root, relative);
        const rel = path.relative(root, candidate);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Invalid object key');
        let current = root;
        for (const segment of rel.split(path.sep)) {
            current = path.join(current, segment);
            try {
                if (fsSync.lstatSync(current).isSymbolicLink()) {
                    throw new Error('Symbolic links are not allowed in object storage paths');
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
                throw error;
            }
        }
        return candidate;
    }

    async get(key: string): Promise<StoredObject | null> {
        const filePath = this.resolveKey(key);
        try {
            const stat = await fs.lstat(filePath);
            if (!stat.isFile() || stat.isSymbolicLink()) return null;
            const body = new Uint8Array(await fs.readFile(filePath));
            const digest = checksum(body);
            return {
                body,
                size: body.byteLength,
                contentType: contentTypeForObject(key, filePath),
                etag: `\"${digest}\"`,
                uploadedAt: stat.mtime
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    async put(key: string, body: Uint8Array, options: PutObjectOptions = {}): Promise<StoredObject> {
        const filePath = this.resolveKey(key);
        const digest = checksum(body);
        if (options.sha256 && options.sha256.toLowerCase() !== digest) {
            throw new Error('SHA-256 mismatch');
        }
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
        try {
            await fs.writeFile(tempPath, body, { flag: 'wx' });
            await fs.rename(tempPath, filePath);
        } finally {
            await fs.rm(tempPath, { force: true }).catch(() => undefined);
        }
        return {
            body,
            size: body.byteLength,
            contentType: options.contentType || contentTypeForPath(filePath),
            etag: `\"${digest}\"`,
            uploadedAt: new Date()
        };
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        return this.exclusive(key, async () => {
            const current = await this.get(key);
            if ((current?.etag ?? null) !== expectedEtag) return null;
            return this.put(key, body, options);
        });
    }

    async delete(key: string): Promise<void> {
        await fs.rm(this.resolveKey(key), { force: true });
    }

    async exists(key: string): Promise<boolean> {
        return (await this.get(key)) !== null;
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = await this.get(sourceKey);
        if (!source) throw new Error('Source object not found');
        await this.put(destinationKey, source.body, {
            contentType: source.contentType,
            sha256: source.etag.replaceAll('"', '')
        });
    }

    async move(sourceKey: string, destinationKey: string): Promise<void> {
        const sourcePath = this.resolveKey(sourceKey);
        const destinationPath = this.resolveKey(destinationKey);
        await fs.mkdir(path.dirname(destinationPath), { recursive: true });
        await fs.rename(sourcePath, destinationPath);
    }

    async list(prefix: string): Promise<ListedObject[]> {
        const normalizedPrefix = prefix.replace(/^\/+/, '').replace(/\/$/, '');
        const rootPath = this.resolveKey(`${normalizedPrefix}/.__list__`);
        const directory = path.dirname(rootPath);
        const results: ListedObject[] = [];
        const visit = async (current: string): Promise<void> => {
            let entries: import('node:fs').Dirent[];
            try {
                entries = await fs.readdir(current, { withFileTypes: true });
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
                throw error;
            }
            for (const entry of entries) {
                if (entry.isSymbolicLink()) continue;
                const absolute = path.join(current, entry.name);
                if (entry.isDirectory()) await visit(absolute);
                else if (entry.isFile()) {
                    const object = await this.get(`${normalizedPrefix}/${path.relative(directory, absolute).split(path.sep).join('/')}`);
                    if (object) results.push({ key: `${normalizedPrefix}/${path.relative(directory, absolute).split(path.sep).join('/')}`, size: object.size, etag: object.etag });
                }
            }
        };
        await visit(directory);
        return results.sort((left, right) => left.key.localeCompare(right.key));
    }

    async deletePrefix(prefix: string): Promise<void> {
        for (const entry of await this.list(prefix)) await this.delete(entry.key);
    }
}
