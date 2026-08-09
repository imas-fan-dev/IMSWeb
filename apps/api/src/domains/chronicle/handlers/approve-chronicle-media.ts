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
    mutateChronicleMeta,
    readChronicleMeta,
    recordsFromChronicleMeta,
    withChronicleRecords
} from '@/domains/chronicle/chronicle-records';
import { services } from '@/middleware/hono-context';
import type { ValidatedRequestContext } from '@/middleware/request-validation';

export async function handleApproveChronicleMedia(
    c: ValidatedRequestContext<AppEnvironment, 'param', ChronicleMediaParams>
): Promise<Response> {
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const { activityId, filename } = c.req.valid('param');
    const source = chroniclePrefix('upload', activityId, filename);
    const destination = chroniclePrefix('used', activityId, filename);
    const started = await beginChronicleIdempotency(
        c,
        'chronicle:approve',
        { activityId, filename }
    );
    if (started instanceof Response) return started;
    const handle = started;

    if (!handle) {
        if (!await storage.exists(source)) {
            return c.json({ error: '待审核文件不存在' } satisfies ChronicleErrorResponse, 404);
        }
        if (await storage.exists(destination)) {
            return c.json({ error: '目标文件已存在' } satisfies ChronicleErrorResponse, 409);
        }
        const meta = await readChronicleMeta(storage, activityId);
        const records = recordsFromChronicleMeta(meta);
        const matches = records.filter((record) =>
            record.filename === filename && record.status === 'pending'
        );
        if (matches.length !== 1) {
            return c.json({ error: '审核记录状态冲突' } satisfies ChronicleErrorResponse, 409);
        }
        await storage.move(source, destination);
        try {
            await mutateChronicleMeta(storage, activityId, (latest) => {
                const latestRecords = recordsFromChronicleMeta(latest);
                const latestMatches = latestRecords.filter((record) =>
                    record.filename === filename && record.status === 'pending'
                );
                if (latestMatches.length !== 1) {
                    throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
                }
                return withChronicleRecords(latest, latestRecords.map((record) =>
                    record === latestMatches[0] ? { ...record, status: 'approved' } : record
                ));
            });
        } catch (error) {
            await storage.move(destination, source).catch(() => undefined);
            throw error;
        }
        return c.json({ success: true } satisfies ChronicleMutationResponse);
    }

    try {
        const meta = await readChronicleMeta(storage, activityId);
        const records = recordsFromChronicleMeta(meta);
        const pending = records.filter((record) =>
            record.filename === filename && record.status === 'pending'
        );
        const approved = records.filter((record) =>
            record.filename === filename && record.status === 'approved'
        );
        const sourceExists = await storage.exists(source);
        const destinationExists = await storage.exists(destination);

        if (
            handle.recovered && pending.length === 0 && approved.length === 1 &&
            !sourceExists && destinationExists
        ) {
            return await completeChronicleIdempotency(
                handle,
                { success: true } satisfies ChronicleMutationResponse
            );
        }
        if (pending.length !== 1) {
            return await completeChronicleIdempotency(
                handle,
                { error: '审核记录状态冲突' } satisfies ChronicleErrorResponse,
                409
            );
        }
        if (sourceExists && destinationExists) {
            return await completeChronicleIdempotency(
                handle,
                { error: '目标文件已存在' } satisfies ChronicleErrorResponse,
                409
            );
        }
        if (!sourceExists && !destinationExists) {
            return await completeChronicleIdempotency(
                handle,
                { error: '待审核文件不存在' } satisfies ChronicleErrorResponse,
                404
            );
        }

        if (sourceExists) {
            await ensureCurrentIdempotencyHandle(handle);
            await storage.move(source, destination);
        }
        await ensureCurrentIdempotencyHandle(handle);
        await mutateChronicleMeta(storage, activityId, (latest) => {
            const latestRecords = recordsFromChronicleMeta(latest);
            const latestPending = latestRecords.filter((record) =>
                record.filename === filename && record.status === 'pending'
            );
            if (latestPending.length !== 1) {
                throw Object.assign(new Error('审核记录状态冲突'), { status: 409 });
            }
            return withChronicleRecords(latest, latestRecords.map((record) =>
                record === latestPending[0] ? { ...record, status: 'approved' } : record
            ));
        });
        return await completeChronicleIdempotency(
            handle,
            { success: true } satisfies ChronicleMutationResponse
        );
    } catch (error) {
        await failChronicleIdempotency(handle);
        throw error;
    }
}
