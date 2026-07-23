import type { Context } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { authenticateCoreRequest, coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { chronicleUploadIdempotencyKey } from '@/middleware/rate-limit';
import type { ObjectStorage } from '@/ports/object-storage';
import type { IdempotencyStore } from '@/ports/idempotency-store';
import type { UploadedFile } from '@/ports/upload-parser';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    getClientAddress,
    messageFromError,
    randomHex,
    safeUploadBaseName,
    services,
    sha256Hex,
    statusFromError
} from '@/shared/hono-utils';
import { validateUploadedImage } from '@/shared/image-upload';
import { deleteObjectWithCompensation } from '@/shared/compensation';
import { storedObjectResponse } from '@/shared/stored-object-response';

interface ChronicleRecord {
    filename: string;
    uploader?: string;
    time?: string;
    status?: string;
    idempotencyKey?: string;
    [key: string]: unknown;
}

interface ChronicleMeta {
    records?: ChronicleRecord[];
    title?: string;
    date?: string;
    location?: string;
    [key: string]: unknown;
}

interface IdempotencyHandle {
    store: IdempotencyStore;
    scope: string;
    key: string;
    fingerprint: string;
    generation: number;
    token: string;
    recovered: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' }
    });
}

async function idempotencyFingerprint(requestFingerprint: unknown): Promise<string> {
    return sha256Hex(new TextEncoder().encode(JSON.stringify(requestFingerprint)));
}

async function acquiredHandle(
    store: IdempotencyStore,
    scope: string,
    key: string,
    fingerprint: string,
    claim: Extract<Awaited<ReturnType<IdempotencyStore['claim']>>, { kind: 'acquired' }>
): Promise<IdempotencyHandle> {
    return {
        store,
        scope,
        key,
        fingerprint,
        generation: claim.generation,
        token: await sha256Hex(new TextEncoder().encode(
            `${scope}\0${key}\0${claim.generation}`
        )),
        recovered: claim.recovered
    };
}

async function claimIdempotency(
    c: Context<AppEnvironment>,
    scope: string,
    rawKey: string | null,
    fingerprint: string
): Promise<IdempotencyHandle | Response | null> {
    if (rawKey === null) return null;
    const store = services(c).idempotency;
    if (!store) return jsonResponse({ error: '幂等服务不可用' }, 503);
    const claim = await store.claim(scope, rawKey, fingerprint);
    if (claim.kind === 'replay') {
        return jsonResponse(claim.response.body, claim.response.status);
    }
    if (claim.kind === 'conflict') {
        return jsonResponse({ error: '幂等键与请求不匹配' }, 409);
    }
    if (claim.kind === 'in-progress') {
        return jsonResponse({ error: '请求正在处理中' }, 409);
    }
    return acquiredHandle(store, scope, rawKey, fingerprint, claim);
}

async function beginIdempotency(
    c: Context<AppEnvironment>,
    scope: string,
    requestFingerprint: unknown
): Promise<IdempotencyHandle | Response | null> {
    const key = chronicleUploadIdempotencyKey(c.req.raw);
    return claimIdempotency(c, scope, key, await idempotencyFingerprint(requestFingerprint));
}

async function isCurrent(handle: IdempotencyHandle | null): Promise<boolean> {
    return !handle || handle.store.isCurrent(
        handle.scope,
        handle.key,
        handle.fingerprint,
        handle.generation
    );
}

async function ensureCurrent(handle: IdempotencyHandle | null): Promise<void> {
    if (!await isCurrent(handle)) {
        throw Object.assign(new Error('幂等租约已失效'), { status: 409 });
    }
}

async function deleteGenerationObject(
    runtime: RuntimeServices,
    handle: IdempotencyHandle | null,
    key: string
): Promise<void> {
    if (!await isCurrent(handle)) return;
    if (handle && runtime.storage?.deleteIfOwned) {
        await runtime.storage.deleteIfOwned(key, handle.token);
        return;
    }
    await deleteObjectWithCompensation(runtime, key);
}

async function cleanupCommittedObject(runtime: RuntimeServices, key: string): Promise<void> {
    try {
        await deleteObjectWithCompensation(runtime, key);
    } catch (error) {
        console.error('Failed to clean media for committed Chronicle mutation', error);
    }
}

async function completeIdempotency(
    handle: IdempotencyHandle | null,
    body: unknown,
    status = 200
): Promise<Response> {
    if (handle) {
        await handle.store.complete(
            handle.scope,
            handle.key,
            handle.fingerprint,
            handle.generation,
            { status, body }
        );
    }
    return jsonResponse(body, status);
}

async function failIdempotency(handle: IdempotencyHandle | null): Promise<void> {
    if (handle) {
        await handle.store.fail(
            handle.scope,
            handle.key,
            handle.fingerprint,
            handle.generation
        ).catch(() => undefined);
    }
}

function safeSegment(value: unknown, label: string): string {
    const segment = String(value ?? '');
    if (
        !segment || segment !== segment.trim() || segment === '.' || segment === '..' ||
        segment.length > 180 || /[\u0000-\u001f\u007f\\/<>:"|?*]/.test(segment)
    ) {
        throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
    }
    return segment;
}

function prefix(bucket: string, activityId = '', filename = ''): string {
    return ['assets/images/eventchronicle/events', bucket, activityId, filename]
        .filter(Boolean).join('/');
}

function metaKey(activityId: string): string {
    return prefix('meta', '', `${activityId}.json`);
}

function recordsFromMeta(meta: unknown): ChronicleRecord[] {
    if (Array.isArray(meta)) return meta as ChronicleRecord[];
    if (meta && typeof meta === 'object' && Array.isArray((meta as ChronicleMeta).records)) {
        return (meta as ChronicleMeta).records!;
    }
    return [];
}

function withRecords(meta: unknown, records: ChronicleRecord[]): unknown {
    return Array.isArray(meta) ? records : {
        ...(meta && typeof meta === 'object' ? meta : {}),
        records
    };
}

async function readMeta(storage: ObjectStorage, activityId: string): Promise<unknown> {
    return (await readMetaSnapshot(storage, activityId)).value;
}

async function readMetaSnapshot(
    storage: ObjectStorage,
    activityId: string
): Promise<{ value: unknown; etag: string | null }> {
    const object = await storage.get(metaKey(activityId));
    if (!object) return { value: { records: [] }, etag: null };
    return {
        value: JSON.parse(new TextDecoder().decode(object.body)) as unknown,
        etag: object.etag
    };
}

async function mutateMeta(
    storage: ObjectStorage,
    activityId: string,
    mutation: (current: unknown) => unknown
): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const current = await readMetaSnapshot(storage, activityId);
        const next = mutation(current.value);
        const body = new TextEncoder().encode(JSON.stringify(next, null, 2));
        const options = { contentType: 'application/json; charset=utf-8' };
        if (!storage.putIfUnchanged) {
            await storage.put(metaKey(activityId), body, options);
            return;
        }
        if (await storage.putIfUnchanged(metaKey(activityId), current.etag, body, options)) return;
    }
    throw Object.assign(new Error('编年史元数据并发冲突'), { status: 409 });
}

function files(value: UploadedFile | UploadedFile[] | undefined): UploadedFile[] {
    return value ? Array.isArray(value) ? value : [value] : [];
}

async function uploadLimit(
    c: Context<AppEnvironment>,
    identity?: string
): Promise<Response | null> {
    const limiter = services(c).rateLimiter;
    if (!limiter) return null;
    const result = await limiter.consume(
        'public-upload',
        getClientAddress(c),
        30,
        60 * 60,
        identity === undefined
            ? undefined
            : { operation: 'chronicle:upload', identity }
    );
    return result.allowed ? null : c.json({ error: 'Too many requests' }, 429);
}

async function beginUploadIdempotency(
    c: Context<AppEnvironment>,
    key: string | null,
    fingerprint: string
): Promise<IdempotencyHandle | Response | null> {
    if (key === null) return await uploadLimit(c) ?? null;
    const store = services(c).idempotency;
    if (!store) return jsonResponse({ error: '幂等服务不可用' }, 503);
    const claim = await store.claim('chronicle:upload', key, fingerprint);
    if (claim.kind === 'conflict' || claim.kind === 'in-progress') {
        const limited = await uploadLimit(c);
        if (limited) return limited;
        return claim.kind === 'conflict'
            ? jsonResponse({ error: '幂等键与请求不匹配' }, 409)
            : jsonResponse({ error: '请求正在处理中' }, 409);
    }
    const identity = `${key}:${fingerprint}`;
    const limited = await uploadLimit(c, identity);
    if (limited) {
        if (claim.kind === 'acquired') {
            await store.fail(
                'chronicle:upload',
                key,
                fingerprint,
                claim.generation
            ).catch(() => undefined);
        }
        return limited;
    }
    if (claim.kind === 'replay') {
        return jsonResponse(claim.response.body, claim.response.status);
    }
    return acquiredHandle(store, 'chronicle:upload', key, fingerprint, claim);
}

async function privateAccess(c: Context<AppEnvironment>): Promise<Response | null> {
    const failure = await authenticateCoreRequest(c);
    if (failure) return failure;
    return c.get('user')?.dept === 'op' ? null : c.json({ message: '无权限（仅op可访问）' }, 403);
}

function encodedMediaUrl(bucket: string, activityId: string, filename: string): string {
    return `/assets/images/eventchronicle/events/${bucket}/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`;
}

export function registerChronicleRoutes(app: ImsHonoApp): void {
    const servePending = async (c: Context<AppEnvironment>): Promise<Response> => {
        const failure = await privateAccess(c);
        if (failure) return failure;
        const activityId = safeSegment(c.req.param('activityId'), 'activityId');
        const filename = safeSegment(c.req.param('filename'), 'filename');
        const object = await services(c).storage?.get(prefix('upload', activityId, filename));
        if (!object) return c.text('Not Found', 404);
        return storedObjectResponse(c.req.raw, object, {
            'Cache-Control': 'private, no-store',
            'Vary': 'Cookie, Authorization'
        });
    };
    app.get('/assets/images/eventchronicle/events/upload/:activityId/:filename', servePending);
    app.on('HEAD', '/assets/images/eventchronicle/events/upload/:activityId/:filename', servePending);

    const serveApproved = async (c: Context<AppEnvironment>): Promise<Response> => {
        const activityId = safeSegment(c.req.param('activityId'), 'activityId');
        const filename = safeSegment(c.req.param('filename'), 'filename');
        const object = await services(c).storage?.get(prefix('used', activityId, filename));
        if (!object) return c.text('Not Found', 404);
        return storedObjectResponse(c.req.raw, object, {
            'Cache-Control': 'public, max-age=3600'
        });
    };
    app.get('/assets/images/eventchronicle/events/used/:activityId/:filename', serveApproved);
    app.on('HEAD', '/assets/images/eventchronicle/events/used/:activityId/:filename', serveApproved);

    app.post('/eventchronicle/upload', async (c) => {
        const idempotencyKey = chronicleUploadIdempotencyKey(c.req.raw);
        const runtime = services(c);
        if (!runtime.uploads || !runtime.images || !runtime.storage) throw new Error('Upload services unavailable');
        const written: string[] = [];
        let handle: IdempotencyHandle | null = null;
        let metadataCommitted = false;
        try {
            const parsed = await runtime.uploads.parse(c.req.raw, {
                maxBytes: 25 * 1024 * 1024 + 256 * 1024,
                fileFields: ['images'],
                maxFiles: 5,
                maxFields: 8,
                maxParts: 13
            });
            const activityId = safeSegment(parsed.fields.activityId || '0', 'activityId');
            const username = (parsed.fields.username || '匿名')
                .replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || '匿名';
            const uploads = files(parsed.files.images);
            if (!uploads.length || uploads.length > 5) {
                return c.json({ success: false, error: '最多上传5张图片' }, 400);
            }
            if (uploads.some((file) => file.body.byteLength > 5 * 1024 * 1024)) {
                return c.json({ success: false, error: '文件过大' }, 400);
            }
            const digested = await Promise.all(uploads.map(async (file) => ({
                file,
                digest: await sha256Hex(file.body)
            })));
            const fingerprint = await idempotencyFingerprint({
                activityId,
                username,
                files: digested.map(({ file, digest }) => ({
                    filename: file.filename,
                    contentType: file.contentType,
                    byteLength: file.body.byteLength,
                    digest
                }))
            });
            const started = await beginUploadIdempotency(c, idempotencyKey, fingerprint);
            if (started instanceof Response) return started;
            handle = started;
            const validated = await Promise.all(digested.map(async ({ file, digest }) => ({
                file,
                digest,
                info: await validateUploadedImage(file, runtime.images!)
            })));
            const claimedKey = handle?.key || '';
            const current = await readMeta(runtime.storage, activityId);
            const currentRecords = recordsFromMeta(current);
            if (claimedKey && currentRecords.some((record) => record.idempotencyKey === claimedKey)) {
                return completeIdempotency(handle, {
                    success: true,
                    count: currentRecords.filter((record) => record.idempotencyKey === claimedKey).length
                });
            }
            const newRecords: ChronicleRecord[] = [];
            for (const [index, { file, info }] of validated.entries()) {
                await ensureCurrent(handle);
                const extension = info.format === 'jpeg' ? 'jpg' : info.format;
                const suffix = handle
                    ? `${handle.token.slice(0, 24)}-${index}`
                    : `${Date.now()}-${randomHex(6)}`;
                const filename = `${safeUploadBaseName(file.filename)}-${suffix}.${extension}`;
                const key = prefix('upload', activityId, filename);
                await runtime.storage.put(key, file.body, {
                    contentType: info.contentType,
                    ...(handle ? { ownerToken: handle.token } : {})
                });
                written.push(key);
                newRecords.push({
                    filename,
                    uploader: username,
                    time: new Date().toISOString(),
                    status: 'pending',
                    ...(claimedKey ? { idempotencyKey: claimedKey } : {})
                });
            }
            await ensureCurrent(handle);
            await mutateMeta(runtime.storage, activityId, (latest) => {
                const latestRecords = recordsFromMeta(latest);
                return claimedKey && latestRecords.some((record) =>
                    record.idempotencyKey === claimedKey)
                    ? latest
                    : withRecords(latest, [...latestRecords, ...newRecords]);
            });
            metadataCommitted = true;
            return await completeIdempotency(handle, { success: true, count: newRecords.length });
        } catch (error) {
            if (!metadataCommitted && await isCurrent(handle)) {
                await Promise.all(written.map((key) =>
                    deleteGenerationObject(runtime, handle, key).catch(() => undefined)
                ));
            }
            await failIdempotency(handle);
            const status = statusFromError(error);
            if (status >= 500) {
                console.error('Chronicle upload failed', error);
                return c.json({ success: false, error: '服务器错误' }, status as 500);
            }
            return c.json({ success: false, error: messageFromError(error) }, status as 400);
        }
    });

    app.get('/eventchronicle/activities/:id', async (c) => {
        const activityId = safeSegment(c.req.param('id'), 'activityId');
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        let meta: ChronicleMeta = {};
        try {
            const value = await readMeta(storage, activityId);
            if (value && typeof value === 'object' && !Array.isArray(value)) meta = value as ChronicleMeta;
        } catch {
            // Preserve legacy fallback on malformed metadata.
        }
        const usedPrefix = `${prefix('used', activityId)}/`;
        const images = (await storage.list(usedPrefix))
            .filter((entry) => entry.key.startsWith(usedPrefix))
            .map((entry) => encodedMediaUrl('used', activityId, entry.key.split('/').at(-1)!));
        return c.json({
            id: activityId,
            title: meta.title || `活动 ${activityId}`,
            date: meta.date || '待补充',
            location: meta.location || '待补充',
            images
        });
    });

    app.get('/eventchronicle/admin', coreAuth, opOnly, async (c) => {
        const assets = services(c).staticAssets;
        return assets ? assets.fetch(new Request(new URL('/eventchronicleadmin.html', c.req.url), c.req.raw)) : c.text('Not Found', 404);
    });

    app.get('/eventchronicle/admin/pending', coreAuth, opOnly, async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const result: Record<string, Array<Record<string, unknown>>> = {};
        for (const entry of await storage.list(prefix('meta'))) {
            const activityId = entry.key.split('/').at(-1)!.replace(/\.json$/, '');
            try {
                const records = recordsFromMeta(await readMeta(storage, activityId))
                    .filter((record) => record.status === 'pending')
                    .map((record) => ({
                        filename: record.filename,
                        url: encodedMediaUrl('upload', activityId, record.filename),
                        uploader: record.uploader,
                        time: record.time
                    }));
                if (records.length) result[activityId] = records;
            } catch {
                // Skip malformed legacy metadata.
            }
        }
        return c.json(result);
    });

    app.get('/eventchronicle/admin/used', coreAuth, opOnly, async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const result: Record<string, Array<{ filename: string; url: string }>> = {};
        for (const entry of await storage.list(prefix('used'))) {
            const parts = entry.key.split('/');
            const activityId = parts.at(-2)!;
            const filename = parts.at(-1)!;
            (result[activityId] ||= []).push({ filename, url: encodedMediaUrl('used', activityId, filename) });
        }
        return c.json(result);
    });

    app.post('/eventchronicle/admin/approve/:activityId/:filename', coreAuth, opOnly, coreCsrf, async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const activityId = safeSegment(c.req.param('activityId'), 'activityId');
        const filename = safeSegment(c.req.param('filename'), 'filename');
        const source = prefix('upload', activityId, filename);
        const destination = prefix('used', activityId, filename);
        const started = await beginIdempotency(c, 'chronicle:approve', { activityId, filename });
        if (started instanceof Response) return started;
        const handle = started;

        if (!handle) {
            if (!await storage.exists(source)) return c.json({ error: '待审核文件不存在' }, 404);
            if (await storage.exists(destination)) return c.json({ error: '目标文件已存在' }, 409);
            const meta = await readMeta(storage, activityId);
            const records = recordsFromMeta(meta);
            const matches = records.filter((record) => record.filename === filename && record.status === 'pending');
            if (matches.length !== 1) return c.json({ error: '审核记录状态冲突' }, 409);
            await storage.move(source, destination);
            try {
                await mutateMeta(storage, activityId, (latest) => {
                    const latestRecords = recordsFromMeta(latest);
                    const latestMatches = latestRecords.filter((record) =>
                        record.filename === filename && record.status === 'pending'
                    );
                    if (latestMatches.length !== 1) {
                        throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                    }
                    return withRecords(latest, latestRecords.map((record) =>
                        record === latestMatches[0] ? { ...record, status: 'approved' } : record
                    ));
                });
            } catch (error) {
                await storage.move(destination, source).catch(() => undefined);
                throw error;
            }
            return c.json({ success: true });
        }

        try {
            const meta = await readMeta(storage, activityId);
            const records = recordsFromMeta(meta);
            const pending = records.filter((record) => record.filename === filename && record.status === 'pending');
            const approved = records.filter((record) => record.filename === filename && record.status === 'approved');
            const sourceExists = await storage.exists(source);
            const destinationExists = await storage.exists(destination);

            if (handle.recovered && pending.length === 0 && approved.length === 1 &&
                !sourceExists && destinationExists) {
                return await completeIdempotency(handle, { success: true });
            }
            if (pending.length !== 1) {
                return await completeIdempotency(handle, { error: '审核记录状态冲突' }, 409);
            }
            if (sourceExists && destinationExists) {
                return await completeIdempotency(handle, { error: '目标文件已存在' }, 409);
            }
            if (!sourceExists && !destinationExists) {
                return await completeIdempotency(handle, { error: '待审核文件不存在' }, 404);
            }

            if (sourceExists) {
                await ensureCurrent(handle);
                await storage.move(source, destination);
            }
            await ensureCurrent(handle);
            await mutateMeta(storage, activityId, (latest) => {
                const latestRecords = recordsFromMeta(latest);
                const latestPending = latestRecords.filter((record) =>
                    record.filename === filename && record.status === 'pending'
                );
                if (latestPending.length !== 1) {
                    throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                }
                return withRecords(latest, latestRecords.map((record) =>
                    record === latestPending[0] ? { ...record, status: 'approved' } : record
                ));
            });
            return await completeIdempotency(handle, { success: true });
        } catch (error) {
            await failIdempotency(handle);
            throw error;
        }
    });

    app.post('/eventchronicle/admin/reject/:activityId/:filename', coreAuth, opOnly, coreCsrf, async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const activityId = safeSegment(c.req.param('activityId'), 'activityId');
        const filename = safeSegment(c.req.param('filename'), 'filename');
        const source = prefix('upload', activityId, filename);
        const started = await beginIdempotency(c, 'chronicle:reject', { activityId, filename });
        if (started instanceof Response) return started;
        const handle = started;

        if (!handle) {
            const meta = await readMeta(storage, activityId);
            const records = recordsFromMeta(meta);
            const matches = records.filter((record) => record.filename === filename);
            if (!matches.length) return c.json({ error: '审核记录不存在' }, 404);
            if (matches.some((record) => record.status !== 'pending')) {
                return c.json({ error: '审核记录状态冲突' }, 409);
            }
            const trash = prefix('.trash', randomHex(10), filename);
            const hadFile = await storage.exists(source);
            if (hadFile) await storage.move(source, trash);
            try {
                await mutateMeta(storage, activityId, (latest) => {
                    const latestRecords = recordsFromMeta(latest);
                    const latestMatches = latestRecords.filter((record) => record.filename === filename);
                    if (!latestMatches.length) {
                        throw Object.assign(new Error('审核记录不存在'), { status: 404 });
                    }
                    if (latestMatches.some((record) => record.status !== 'pending')) {
                        throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                    }
                    return withRecords(latest, latestRecords.filter((record) => record.filename !== filename));
                });
            } catch (error) {
                if (hadFile) await storage.move(trash, source).catch(() => undefined);
                throw error;
            }
            if (hadFile) await cleanupCommittedObject(services(c), trash);
            return c.json({ success: true });
        }

        try {
            const meta = await readMeta(storage, activityId);
            const records = recordsFromMeta(meta);
            const matches = records.filter((record) => record.filename === filename);
            const sourceExists = await storage.exists(source);

            if (handle.recovered && !matches.length) {
                const response = await completeIdempotency(handle, { success: true });
                if (sourceExists) await cleanupCommittedObject(services(c), source);
                return response;
            }
            if (!matches.length) {
                return await completeIdempotency(handle, { error: '审核记录不存在' }, 404);
            }
            if (matches.some((record) => record.status !== 'pending')) {
                return await completeIdempotency(handle, { error: '审核记录状态冲突' }, 409);
            }
            await ensureCurrent(handle);
            await mutateMeta(storage, activityId, (latest) => {
                const latestRecords = recordsFromMeta(latest);
                const latestMatches = latestRecords.filter((record) => record.filename === filename);
                if (latestMatches.some((record) => record.status !== 'pending')) {
                    throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                }
                return withRecords(latest, latestRecords.filter((record) => record.filename !== filename));
            });
            const response = await completeIdempotency(handle, { success: true });
            if (sourceExists) await cleanupCommittedObject(services(c), source);
            return response;
        } catch (error) {
            await failIdempotency(handle);
            throw error;
        }
    });

    app.get('/eventchronicle/activities', async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const activities: Array<Record<string, unknown>> = [];
        for (const entry of await storage.list(prefix('meta'))) {
            const id = entry.key.split('/').at(-1)!.replace(/\.json$/, '');
            try {
                const value = await readMeta(storage, id);
                const meta = value && typeof value === 'object' && !Array.isArray(value) ? value as ChronicleMeta : {};
                const usedPrefix = `${prefix('used', id)}/`;
                const used = (await storage.list(usedPrefix))
                    .filter((entry) => entry.key.startsWith(usedPrefix));
                activities.push({
                    id,
                    title: meta.title || `活动 ${id}`,
                    date: meta.date || '待定',
                    location: meta.location || '待补充',
                    cover: used[0] ? encodedMediaUrl('used', id, used[0].key.split('/').at(-1)!) : null
                });
            } catch {
                // Skip malformed metadata.
            }
        }
        activities.sort((left, right) => {
            const a = String(left.date);
            const b = String(right.date);
            if (a === '待定') return b === '待定' ? 0 : 1;
            if (b === '待定') return -1;
            return a.localeCompare(b);
        });
        return c.json(activities);
    });

    app.delete('/eventchronicle/admin/delete-used/:activityId/:filename', coreAuth, opOnly, coreCsrf, async (c) => {
        const storage = services(c).storage;
        if (!storage) throw new Error('Object storage unavailable');
        const activityId = safeSegment(c.req.param('activityId'), 'activityId');
        const filename = safeSegment(c.req.param('filename'), 'filename');
        const source = prefix('used', activityId, filename);
        const started = await beginIdempotency(c, 'chronicle:delete-used', { activityId, filename });
        if (started instanceof Response) return started;
        const handle = started;

        if (!handle) {
            if (!await storage.exists(source)) return c.json({ error: '文件不存在' }, 404);
            const meta = await readMeta(storage, activityId);
            const records = recordsFromMeta(meta);
            const matches = records.filter((record) => record.filename === filename);
            if (matches.some((record) => record.status && record.status !== 'approved')) {
                return c.json({ error: '审核记录状态冲突' }, 409);
            }
            const trash = prefix('.trash', randomHex(10), filename);
            await storage.move(source, trash);
            try {
                await mutateMeta(storage, activityId, (latest) => {
                    const latestRecords = recordsFromMeta(latest);
                    const latestMatches = latestRecords.filter((record) => record.filename === filename);
                    if (latestMatches.some((record) => record.status && record.status !== 'approved')) {
                        throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                    }
                    return withRecords(latest, latestRecords.filter((record) => record.filename !== filename));
                });
            } catch (error) {
                await storage.move(trash, source).catch(() => undefined);
                throw error;
            }
            await cleanupCommittedObject(services(c), trash);
            return c.json({ success: true });
        }

        try {
            const meta = await readMeta(storage, activityId);
            const records = recordsFromMeta(meta);
            const matches = records.filter((record) => record.filename === filename);
            const sourceExists = await storage.exists(source);

            if (handle.recovered && !matches.length) {
                const response = await completeIdempotency(handle, { success: true });
                if (sourceExists) await cleanupCommittedObject(services(c), source);
                return response;
            }
            if (matches.some((record) => record.status && record.status !== 'approved')) {
                return await completeIdempotency(handle, { error: '审核记录状态冲突' }, 409);
            }
            if (!sourceExists && !handle.recovered) {
                return await completeIdempotency(handle, { error: '文件不存在' }, 404);
            }
            await ensureCurrent(handle);
            await mutateMeta(storage, activityId, (latest) => {
                const latestRecords = recordsFromMeta(latest);
                const latestMatches = latestRecords.filter((record) => record.filename === filename);
                if (latestMatches.some((record) => record.status && record.status !== 'approved')) {
                    throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                }
                return withRecords(latest, latestRecords.filter((record) => record.filename !== filename));
            });
            const response = await completeIdempotency(handle, { success: true });
            if (sourceExists) await cleanupCommittedObject(services(c), source);
            return response;
        } catch (error) {
            await failIdempotency(handle);
            throw error;
        }
    });
}
