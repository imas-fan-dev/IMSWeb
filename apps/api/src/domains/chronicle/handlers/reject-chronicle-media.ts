import type { AppEnvironment } from '@/app';
import type { ChronicleMediaParams } from '@/domains/chronicle/request';
import type {
    ChronicleErrorResponse,
    ChronicleMutationResponse
} from '@/domains/chronicle/response';
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
    withChronicleRecords
} from '@/domains/chronicle/chronicle-records';
import { randomHex } from '@/utils/crypto/random';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleRejectChronicleMedia(
    c: ValidatedRequestContext<AppEnvironment, 'param', ChronicleMediaParams>
): Promise<Response> {
    const runtime = services(c);
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { activityId, filename } = c.req.valid('param');
    const source = chroniclePrefix('upload', activityId, filename);
    const started = await beginChronicleIdempotency(
        c,
        'chronicle:reject',
        { activityId, filename }
    );
    if (started instanceof Response) return started;
    const handle = started;

    if (!handle) {
        const meta = await readChronicleMeta(storage, activityId);
        const records = recordsFromChronicleMeta(meta);
        const matches = records.filter((record) => record.filename === filename);
        if (!matches.length) {
            return c.json({ error: '审核记录不存在' } satisfies ChronicleErrorResponse, 404);
        }
        if (matches.some((record) => record.status !== 'pending')) {
            return c.json({ error: '审核记录状态冲突' } satisfies ChronicleErrorResponse, 409);
        }
        const trash = chroniclePrefix('.trash', randomHex(10), filename);
        const hadFile = await storage.exists(source);
        if (hadFile) await storage.move(source, trash);
        try {
            await mutateChronicleMeta(storage, activityId, (latest) => {
                const latestRecords = recordsFromChronicleMeta(latest);
                const latestMatches = latestRecords.filter((record) =>
                    record.filename === filename
                );
                if (!latestMatches.length) {
                    throw Object.assign(new Error('审核记录不存在'), { status: 404 });
                }
                if (latestMatches.some((record) => record.status !== 'pending')) {
                    throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                }
                return withChronicleRecords(
                    latest,
                    latestRecords.filter((record) => record.filename !== filename)
                );
            });
        } catch (error) {
            if (hadFile) await storage.move(trash, source).catch(() => undefined);
            throw error;
        }
        if (hadFile) await cleanupCommittedChronicleObject(runtime, trash);
        return c.json({ success: true } satisfies ChronicleMutationResponse);
    }

    try {
        const meta = await readChronicleMeta(storage, activityId);
        const records = recordsFromChronicleMeta(meta);
        const matches = records.filter((record) => record.filename === filename);
        const sourceExists = await storage.exists(source);

        if (handle.recovered && !matches.length) {
            const response = await completeChronicleIdempotency(
                handle,
                { success: true } satisfies ChronicleMutationResponse
            );
            if (sourceExists) await cleanupCommittedChronicleObject(runtime, source);
            return response;
        }
        if (!matches.length) {
            return await completeChronicleIdempotency(
                handle,
                { error: '审核记录不存在' } satisfies ChronicleErrorResponse,
                404
            );
        }
        if (matches.some((record) => record.status !== 'pending')) {
            return await completeChronicleIdempotency(
                handle,
                { error: '审核记录状态冲突' } satisfies ChronicleErrorResponse,
                409
            );
        }
        await ensureCurrentIdempotencyHandle(handle);
        await mutateChronicleMeta(storage, activityId, (latest) => {
            const latestRecords = recordsFromChronicleMeta(latest);
            const latestMatches = latestRecords.filter((record) => record.filename === filename);
            if (latestMatches.some((record) => record.status !== 'pending')) {
                throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
            }
            return withChronicleRecords(
                latest,
                latestRecords.filter((record) => record.filename !== filename)
            );
        });
        const response = await completeChronicleIdempotency(
            handle,
            { success: true } satisfies ChronicleMutationResponse
        );
        if (sourceExists) await cleanupCommittedChronicleObject(runtime, source);
        return response;
    } catch (error) {
        await failChronicleIdempotency(handle);
        throw error;
    }
}
