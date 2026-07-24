import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    beginChronicleIdempotency,
    completeChronicleIdempotency,
    ensureCurrentIdempotencyHandle,
    failChronicleIdempotency
} from '@/domains/chronicle/chronicle-idempotency';
import {
    chroniclePrefix,
    cleanupCommittedChronicleObject,
    mutateChronicleMeta,
    readChronicleMeta,
    recordsFromChronicleMeta,
    safeChronicleSegment,
    withChronicleRecords
} from '@/domains/chronicle/chronicle-records';
import { randomHex } from '@/utils/crypto/random';
import { services } from '@/middleware/hono-context';

export async function handleDeleteUsedChronicleMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const runtime = services(c);
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage unavailable');
    const activityId = safeChronicleSegment(c.req.param('activityId'), 'activityId');
    const filename = safeChronicleSegment(c.req.param('filename'), 'filename');
    const source = chroniclePrefix('used', activityId, filename);
    const started = await beginChronicleIdempotency(
        c,
        'chronicle:delete-used',
        { activityId, filename }
    );
    if (started instanceof Response) return started;
    const handle = started;

    if (!handle) {
        if (!await storage.exists(source)) return c.json({ error: '文件不存在' }, 404);
        const meta = await readChronicleMeta(storage, activityId);
        const records = recordsFromChronicleMeta(meta);
        const matches = records.filter((record) => record.filename === filename);
        if (matches.some((record) => record.status && record.status !== 'approved')) {
            return c.json({ error: '审核记录状态冲突' }, 409);
        }
        const trash = chroniclePrefix('.trash', randomHex(10), filename);
        await storage.move(source, trash);
        try {
            await mutateChronicleMeta(storage, activityId, (latest) => {
                const latestRecords = recordsFromChronicleMeta(latest);
                const latestMatches = latestRecords.filter((record) =>
                    record.filename === filename
                );
                if (latestMatches.some((record) =>
                    record.status && record.status !== 'approved'
                )) {
                    throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                }
                return withChronicleRecords(
                    latest,
                    latestRecords.filter((record) => record.filename !== filename)
                );
            });
        } catch (error) {
            await storage.move(trash, source).catch(() => undefined);
            throw error;
        }
        await cleanupCommittedChronicleObject(runtime, trash);
        return c.json({ success: true });
    }

    try {
        const meta = await readChronicleMeta(storage, activityId);
        const records = recordsFromChronicleMeta(meta);
        const matches = records.filter((record) => record.filename === filename);
        const sourceExists = await storage.exists(source);

        if (handle.recovered && !matches.length) {
            const response = await completeChronicleIdempotency(handle, { success: true });
            if (sourceExists) await cleanupCommittedChronicleObject(runtime, source);
            return response;
        }
        if (matches.some((record) => record.status && record.status !== 'approved')) {
            return await completeChronicleIdempotency(
                handle,
                { error: '审核记录状态冲突' },
                409
            );
        }
        if (!sourceExists && !handle.recovered) {
            return await completeChronicleIdempotency(handle, { error: '文件不存在' }, 404);
        }
        await ensureCurrentIdempotencyHandle(handle);
        await mutateChronicleMeta(storage, activityId, (latest) => {
            const latestRecords = recordsFromChronicleMeta(latest);
            const latestMatches = latestRecords.filter((record) => record.filename === filename);
            if (latestMatches.some((record) =>
                record.status && record.status !== 'approved'
            )) {
                throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
            }
            return withChronicleRecords(
                latest,
                latestRecords.filter((record) => record.filename !== filename)
            );
        });
        const response = await completeChronicleIdempotency(handle, { success: true });
        if (sourceExists) await cleanupCommittedChronicleObject(runtime, source);
        return response;
    } catch (error) {
        await failChronicleIdempotency(handle);
        throw error;
    }
}
