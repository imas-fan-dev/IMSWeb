import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ObjectStorage } from '@/ports/object-storage';
import { contentTypeForPath } from '@/utils/http/content-type';

const BUSINESS_DIRECTORIES = ['event', 'information', 'namecard', 'news'] as const;

export type LocalUploadSyncStatus =
    | 'unchanged'
    | 'would-upload'
    | 'would-replace'
    | 'uploaded'
    | 'replaced';

export interface LocalUploadSyncEntry {
    key: string;
    sourcePath: string;
    bytes: number;
    contentType: string;
    sha256: string;
    status: LocalUploadSyncStatus;
}

export interface LocalUploadSyncReport {
    sourceRoot: string;
    apply: boolean;
    entries: LocalUploadSyncEntry[];
    summary: {
        fileCount: number;
        totalBytes: number;
        unchanged: number;
        wouldUpload: number;
        wouldReplace: number;
        uploaded: number;
        replaced: number;
        verified: number;
    };
}

function sha256(body: Uint8Array): string {
    return crypto.createHash('sha256').update(body).digest('hex');
}

function compareUtf8(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

async function filesUnder(directory: string): Promise<string[]> {
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const files: string[] = [];
    for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
            throw new Error(`Upload media source must not contain symlinks: ${target}`);
        }
        if (entry.isDirectory()) files.push(...await filesUnder(target));
        else if (entry.isFile()) files.push(target);
    }
    return files;
}

function logicalKey(sourceRoot: string, sourcePath: string): string {
    const relative = path.relative(sourceRoot, sourcePath);
    if (!relative || path.isAbsolute(relative) || relative.startsWith(`..${path.sep}`)) {
        throw new Error(`Upload media source escaped its root: ${sourcePath}`);
    }
    const segments = relative.split(path.sep);
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new Error(`Unsafe upload media path: ${sourcePath}`);
    }
    return ['uploads', ...segments].join('/').normalize('NFC');
}

export async function listLocalUploadFiles(sourceRoot: string): Promise<string[]> {
    const absoluteRoot = path.resolve(sourceRoot);
    const files = (
        await Promise.all(BUSINESS_DIRECTORIES.map((directory) => (
            filesUnder(path.join(absoluteRoot, directory))
        )))
    ).flat();
    return files.sort((left, right) => compareUtf8(
        logicalKey(absoluteRoot, left),
        logicalKey(absoluteRoot, right)
    ));
}

export async function syncLocalUploads(
    sourceRoot: string,
    storage: ObjectStorage,
    apply: boolean
): Promise<LocalUploadSyncReport> {
    const absoluteRoot = path.resolve(sourceRoot);
    const files = await listLocalUploadFiles(absoluteRoot);
    const entries: LocalUploadSyncEntry[] = [];
    let verified = 0;

    for (const sourcePath of files) {
        const key = logicalKey(absoluteRoot, sourcePath);
        const body = await fs.readFile(sourcePath);
        const digest = sha256(body);
        const existing = await storage.get(key);
        const existingMatches = existing !== null &&
            existing.size === body.byteLength &&
            sha256(existing.body) === digest;
        let status: LocalUploadSyncStatus;

        if (existingMatches) {
            status = 'unchanged';
            verified += 1;
        } else if (!apply) {
            status = existing ? 'would-replace' : 'would-upload';
        } else {
            status = existing ? 'replaced' : 'uploaded';
            await storage.put(key, body, {
                contentType: contentTypeForPath(sourcePath),
                sha256: digest,
                metadata: { source: 'legacy-local-uploads' }
            });
            const stored = await storage.get(key);
            if (!stored || stored.size !== body.byteLength || sha256(stored.body) !== digest) {
                throw new Error(`Object-storage verification failed after writing ${key}`);
            }
            verified += 1;
        }

        entries.push({
            key,
            sourcePath,
            bytes: body.byteLength,
            contentType: contentTypeForPath(sourcePath),
            sha256: digest,
            status
        });
    }

    const count = (status: LocalUploadSyncStatus) => (
        entries.filter((entry) => entry.status === status).length
    );
    return {
        sourceRoot: absoluteRoot,
        apply,
        entries,
        summary: {
            fileCount: entries.length,
            totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
            unchanged: count('unchanged'),
            wouldUpload: count('would-upload'),
            wouldReplace: count('would-replace'),
            uploaded: count('uploaded'),
            replaced: count('replaced'),
            verified
        }
    };
}
