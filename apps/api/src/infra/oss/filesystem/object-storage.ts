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
import { contentTypeForPath } from '@/utils/http/content-type';

function contentTypeForObject(key: string, filePath: string): string {
    return key.replace(/^\/+/, '').includes('/thumbnail.')
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

export interface FilesystemObjectStorageOptions {
    publicReadUrlBase?: string;
}

function publicObjectUrl(base: string, publicPath: string): string {
    return `${base.replace(/\/+$/, '')}/${publicPath.replace(/^\/+/, '')}`;
}

export class FilesystemObjectStorage implements ObjectStorage {
    private readonly mutationQueues = new Map<string, Promise<void>>();

    constructor(
        private readonly roots: FilesystemStorageRoots,
        private readonly options: FilesystemObjectStorageOptions = {}
    ) {}

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
        if (
            normalized.startsWith('editorial/') ||
            normalized.startsWith('community/')
        ) {
            root = this.roots.uploadsDir;
        } else if (normalized.startsWith('chronicle/')) {
            root = this.roots.chronicleDir;
            relative = normalized.slice('chronicle/'.length);
        } else if (normalized.startsWith('wiki/')) {
            root = this.roots.storyDataDir;
            relative = normalized.slice('wiki/'.length);
        } else if (
            !normalized.startsWith('site-packages/') &&
            !normalized.startsWith('system/')
        ) {
            throw new Error(`Unsupported object key namespace: ${segments[0]}`);
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

    async createPublicReadUrl(
        key: string,
        options: { publicPath?: string } = {}
    ): Promise<string | null> {
        if (!this.options.publicReadUrlBase || !options.publicPath) return null;
        try {
            const stat = await fs.lstat(this.resolveKey(key));
            if (!stat.isFile() || stat.isSymbolicLink()) return null;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
        return publicObjectUrl(this.options.publicReadUrlBase, options.publicPath);
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
