import fs from 'node:fs';
import path from 'node:path';

// config/ has the same depth in src/ and dist/. Built Web assets and mutable
// runtime data have separate roots.
export const PROJECT_ROOT = process.env.IMS_PROJECT_ROOT
    ? path.resolve(process.env.IMS_PROJECT_ROOT)
    : path.resolve(__dirname, '../../../../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

function configuredPath(environmentName: string, fallback: string): string {
    const value = process.env[environmentName];
    return value ? path.resolve(PROJECT_ROOT, value) : fallback;
}

export const PUBLIC_DIR = configuredPath(
    'IMS_PUBLIC_DIR',
    path.join(PROJECT_ROOT, 'apps/api/dist/node-client')
);
export const COMPENSATION_DIR = configuredPath(
    'IMS_COMPENSATION_DIR',
    path.join(DATA_DIR, 'core', 'compensation')
);
export const STORY_DATA_DIR = configuredPath(
    'IMS_STORY_DATA_DIR',
    path.join(DATA_DIR, 'story', 'images')
);
export const UPLOADS_DIR = configuredPath(
    'IMS_UPLOADS_DIR',
    path.join(DATA_DIR, 'uploads')
);
export const NEWS_ORIGINAL_DIR = path.join(UPLOADS_DIR, 'news/original');
export const NEWS_THUMB_DIR = path.join(UPLOADS_DIR, 'news/thumb');
export const NAMECARD_ORIGINAL_DIR = path.join(UPLOADS_DIR, 'namecard/original');
export const EVENT_ORIGINAL_DIR = path.join(UPLOADS_DIR, 'event/original');

export const EVENT_BASE = configuredPath(
    'IMS_EVENT_BASE_DIR',
    path.join(DATA_DIR, 'chronicle')
);
export const CHRONICLE_UPLOAD_DIR = path.join(EVENT_BASE, 'upload');
export const CHRONICLE_USED_DIR = path.join(EVENT_BASE, 'used');
export const CHRONICLE_META_DIR = path.join(EVENT_BASE, 'meta');
export const CHRONICLE_STAGING_DIR = path.join(EVENT_BASE, '.staging');
export const CHRONICLE_TRASH_DIR = path.join(EVENT_BASE, '.trash');

const ALWAYS_RUNTIME_DIRECTORIES = [COMPENSATION_DIR];

const FILESYSTEM_STORAGE_DIRECTORIES = [
    NEWS_ORIGINAL_DIR,
    NEWS_THUMB_DIR,
    NAMECARD_ORIGINAL_DIR,
    EVENT_ORIGINAL_DIR,
    STORY_DATA_DIR,
    CHRONICLE_UPLOAD_DIR,
    CHRONICLE_USED_DIR,
    CHRONICLE_META_DIR,
    CHRONICLE_STAGING_DIR,
    CHRONICLE_TRASH_DIR
];

export function ensureRuntimeDirectories(includeFilesystemStorage = true): void {
    const directories = includeFilesystemStorage
        ? [...ALWAYS_RUNTIME_DIRECTORIES, ...FILESYSTEM_STORAGE_DIRECTORIES]
        : ALWAYS_RUNTIME_DIRECTORIES;
    for (const directory of directories) {
        if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    }
}
