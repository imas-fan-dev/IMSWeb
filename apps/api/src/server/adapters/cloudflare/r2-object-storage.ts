import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import type { CompensationService } from '@/ports/compensation-service';
import { sha256Hex } from '@/shared/hono-utils';
import { parseRange, storedObjectResponse } from '@/shared/stored-object-response';

interface ObjectIndexRow {
    logical_key: string;
    object_id: string;
    state: 'uploading' | 'pending' | 'ready' | 'deleted';
    byte_size: number;
    content_type: string;
    sha256: string;
    etag: string | null;
    owner_token: string | null;
    incarnation: number;
    mutation_token: string | null;
    recovery_source_key: string | null;
}

type PublishedObjectState = 'pending' | 'ready';

const READY_ORPHAN_GRACE_SECONDS = 5 * 60;

interface UploadOperationRow {
    id: string;
    state: 'uploading' | 'pending' | 'ready' | 'deleted';
    logical_key: string;
    object_id: string | null;
    sha256: string | null;
    target_state: PublishedObjectState | null;
    byte_size: number | null;
    content_type: string | null;
    etag: string | null;
    previous_object_id: string | null;
    previous_mutation_token: string | null;
    previous_state: ObjectIndexRow['state'] | null;
    owner_token: string | null;
    incarnation: number;
    mutation_token: string | null;
    recovery_source_key: string | null;
}

interface PendingPublicationRow {
    logical_key: string;
    object_id: string;
    updated_at: string;
    recovery_source_key: string | null;
}

interface ChronicleItemWrite {
    filename: string;
    uploader: string | null;
    uploadedAt: string | null;
    status: 'pending' | 'ready' | 'deleted';
    logicalKey: string;
    idempotencyKey: string;
}

export type R2MutationPhase = 'delete-read' | 'move-read';
export type R2RecoveryPhase = 'before-pending-delete-cas';

export interface R2MutationContext {
    logicalKey: string;
    objectId: string;
}

export type R2UploadPhase = 'operation-created' | 'object-uploaded' | 'index-written';

export interface R2UploadContext {
    operationId: string;
    logicalKey: string;
    objectId: string;
    sha256: string;
    targetState: PublishedObjectState;
    incarnation: number;
}

export interface R2ObjectStorageOptions {
    onUploadPhase?: (
        phase: R2UploadPhase,
        context: R2UploadContext
    ) => void | Promise<void>;
    onMutationPhase?: (
        phase: R2MutationPhase,
        context: R2MutationContext
    ) => void | Promise<void>;
    onRecoveryPhase?: (
        phase: R2RecoveryPhase,
        context: R2MutationContext
    ) => void | Promise<void>;
}

function physicalKey(objectId: string): string {
    return `objects/${objectId}`;
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function chronicleMetaActivity(key: string): string | null {
    const match = /^assets\/images\/eventchronicle\/events\/meta\/(.+)\.json$/.exec(key);
    return match?.[1] || null;
}

function isChronicleUsedKey(key: string): boolean {
    return key.startsWith('assets/images/eventchronicle/events/used/');
}

function isChronicleUploadKey(key: string): boolean {
    return key.startsWith('assets/images/eventchronicle/events/upload/');
}

function isChronicleManagedKey(key: string): boolean {
    return /^assets\/images\/eventchronicle\/events\/(?:upload|used|\.trash)\//.test(key);
}

function targetStateForKey(key: string): PublishedObjectState {
    return isChronicleUploadKey(key) || key.startsWith('assets/images/eventchronicle/events/.trash/')
        ? 'pending'
        : 'ready';
}

export class R2ObjectStorage implements ObjectStorage {
    constructor(
        private readonly database: D1Database,
        private readonly bucket: R2Bucket,
        private readonly compensation?: CompensationService,
        private readonly options: R2ObjectStorageOptions = {}
    ) {}

    private findActive(logicalKey: string): Promise<ObjectIndexRow | null> {
        return this.database.prepare(
            `SELECT oi.* FROM object_index oi
             LEFT JOIN upload_operations u ON u.object_id=oi.object_id
             WHERE oi.logical_key=? AND oi.state IN ('pending', 'ready')
               AND (u.id IS NULL OR u.state=oi.state)`
        ).bind(logicalKey).first<ObjectIndexRow>();
    }

    private findIndexSnapshot(logicalKey: string): Promise<ObjectIndexRow | null> {
        return this.database.prepare(
            'SELECT * FROM object_index WHERE logical_key=?'
        ).bind(logicalKey).first<ObjectIndexRow>();
    }

    private findPublicReadable(logicalKey: string): Promise<ObjectIndexRow | null> {
        const allowPending = isChronicleUploadKey(logicalKey) ||
            logicalKey.startsWith('assets/images/eventchronicle/events/.trash/');
        return this.database.prepare(
            `SELECT oi.* FROM object_index oi
             LEFT JOIN upload_operations u ON u.object_id=oi.object_id
             WHERE oi.logical_key=? AND oi.state IN (?, 'ready')
               AND (u.id IS NULL OR u.state=oi.state)`
        ).bind(logicalKey, allowPending ? 'pending' : 'ready').first<ObjectIndexRow>();
    }

    private findUploadOperation(operationId: string): Promise<UploadOperationRow | null> {
        return this.database.prepare(
            `SELECT id, state, logical_key, object_id, sha256, target_state,
                    byte_size, content_type, etag, previous_object_id, previous_mutation_token,
                    previous_state,
                    owner_token, incarnation,
                    mutation_token, recovery_source_key
             FROM upload_operations WHERE id=?`
        ).bind(operationId).first<UploadOperationRow>();
    }

    private async uploadIdentity(logicalKey: string, digest: string): Promise<{
        operationId: string;
        baseObjectId: string;
    }> {
        const value = new TextEncoder().encode(`object-put\0${logicalKey}\0${digest}`);
        const identity = await sha256Hex(value);
        return { operationId: `put-${identity}`, baseObjectId: `obj-${identity}` };
    }

    private incarnationObjectId(baseObjectId: string, incarnation: number): string {
        return incarnation === 1 ? baseObjectId : `${baseObjectId}-i${incarnation}`;
    }

    private uploadContext(operation: UploadOperationRow): R2UploadContext {
        if (!operation.object_id || !operation.sha256 || !operation.target_state ||
            !Number.isInteger(operation.incarnation) || operation.incarnation < 1) {
            throw new Error('Upload operation is missing recovery metadata');
        }
        return {
            operationId: operation.id,
            logicalKey: operation.logical_key,
            objectId: operation.object_id,
            sha256: operation.sha256,
            targetState: operation.target_state,
            incarnation: operation.incarnation
        };
    }

    private async claimUploadExecution(
        operation: UploadOperationRow,
        staleBefore?: string
    ): Promise<UploadOperationRow | null> {
        if (!operation.object_id || operation.state !== 'uploading') return null;
        const leaseToken = crypto.randomUUID();
        const leaseSql = staleBefore === undefined
            ? 'AND mutation_token IS NULL'
            : "AND mutation_token IS ? AND updated_at <= datetime('now', ?)";
        const result = await this.database.prepare(
            `UPDATE upload_operations
             SET mutation_token=?, updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND object_id=? AND incarnation=? AND state='uploading'
               ${leaseSql}`
        ).bind(
            leaseToken,
            operation.id,
            operation.object_id,
            operation.incarnation,
            ...(staleBefore === undefined ? [] : [operation.mutation_token, staleBefore])
        ).run();
        return result.meta.changes === 1
            ? { ...operation, mutation_token: leaseToken }
            : null;
    }

    private async releaseUploadExecution(operation: UploadOperationRow): Promise<void> {
        if (!operation.object_id || !operation.mutation_token) return;
        await this.database.prepare(
            `UPDATE upload_operations SET mutation_token=NULL, updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND object_id=? AND incarnation=? AND state='uploading'
               AND mutation_token=?`
        ).bind(
            operation.id,
            operation.object_id,
            operation.incarnation,
            operation.mutation_token
        ).run();
    }

    private verifyUploadedObject(operation: UploadOperationRow, object: R2Object): void {
        const digest = object.checksums.toJSON().sha256?.toLowerCase();
        if (!operation.sha256 || digest !== operation.sha256.toLowerCase()) {
            throw new Error('R2 checksum verification failed');
        }
        if (operation.byte_size === null || object.size !== operation.byte_size) {
            throw new Error('R2 byte-size verification failed');
        }
        const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
        if (!operation.content_type || contentType !== operation.content_type) {
            throw new Error('R2 content-type verification failed');
        }
    }

    private async getChronicleMeta(activityId: string): Promise<StoredObject | null> {
        const row = await this.database.prepare(
            'SELECT document_json, updated_at FROM chronicle_metadata WHERE activity_id=?'
        ).bind(activityId).first<{ document_json: string; updated_at: string }>();
        if (!row) return null;
        const body = new TextEncoder().encode(row.document_json);
        return {
            body,
            size: body.byteLength,
            contentType: 'application/json; charset=utf-8',
            etag: `\"${await sha256Hex(body)}\"`,
            uploadedAt: new Date(row.updated_at)
        };
    }

    private chronicleItemWrites(activityId: string, document: unknown): ChronicleItemWrite[] {
        const records = Array.isArray(document)
            ? document
            : document && typeof document === 'object' &&
                Array.isArray((document as { records?: unknown }).records)
                ? (document as { records: unknown[] }).records
                : [];
        const writes: ChronicleItemWrite[] = [];
        for (const value of records) {
            if (!value || typeof value !== 'object') continue;
            const record = value as Record<string, unknown>;
            if (typeof record.filename !== 'string' || !record.filename) continue;
            const status = record.status === 'approved'
                ? 'ready'
                : record.status === 'deleted' ? 'deleted' : 'pending';
            const bucket = status === 'ready' ? 'used' : 'upload';
            writes.push({
                filename: record.filename,
                uploader: typeof record.uploader === 'string' ? record.uploader : null,
                uploadedAt: typeof record.time === 'string' ? record.time : null,
                status,
                logicalKey: `assets/images/eventchronicle/events/${bucket}/${activityId}/${record.filename}`,
                idempotencyKey: typeof record.idempotencyKey === 'string' && record.idempotencyKey
                    ? record.idempotencyKey
                    : `legacy:${activityId}:${record.filename}`
            });
        }
        return writes;
    }

    private chronicleActiveGuard(records: ChronicleItemWrite[]): {
        sql: string;
        values: string[];
    } {
        const active = records.filter((record) => record.status !== 'deleted');
        if (!active.length) return { sql: '1=1', values: [] };
        const rows = active.map((_, index) =>
            `${index === 0 ? 'SELECT' : 'UNION ALL SELECT'} ? AS logical_key, ? AS expected_state`
        ).join(' ');
        return {
            sql: `NOT EXISTS (
                SELECT 1 FROM (${rows}) refs
                WHERE NOT EXISTS (
                    SELECT 1 FROM object_index oi
                    LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                    WHERE oi.logical_key=refs.logical_key AND oi.state=refs.expected_state
                      AND (u.id IS NULL OR (u.logical_key=oi.logical_key AND u.state=oi.state))
                )
            )`,
            values: active.flatMap((record) => [record.logicalKey, record.status])
        };
    }

    private chronicleItemStatements(
        activityId: string,
        commitToken: string,
        records: ChronicleItemWrite[]
    ): D1PreparedStatement[] {
        const statements: D1PreparedStatement[] = [this.database.prepare(
            `DELETE FROM chronicle_items
             WHERE activity_id=? AND EXISTS (
                SELECT 1 FROM chronicle_metadata WHERE activity_id=? AND commit_token=?
             )`
        ).bind(activityId, activityId, commitToken)];
        for (const record of records) {
            statements.push(this.database.prepare(
                `INSERT INTO chronicle_items
                    (id, activity_id, filename, uploader, uploaded_at, status, logical_key, idempotency_key)
                 SELECT ?, ?, ?, ?, ?, ?, ?, ?
                 WHERE EXISTS (
                    SELECT 1 FROM chronicle_metadata WHERE activity_id=? AND commit_token=?
                 )`
            ).bind(
                crypto.randomUUID(), activityId, record.filename, record.uploader,
                record.uploadedAt, record.status, record.logicalKey, record.idempotencyKey,
                activityId, commitToken
            ));
        }
        return statements;
    }

    private async putChronicleMeta(activityId: string, body: Uint8Array): Promise<StoredObject> {
        const documentJson = new TextDecoder().decode(body);
        const records = this.chronicleItemWrites(activityId, JSON.parse(documentJson) as unknown);
        const guard = this.chronicleActiveGuard(records);
        const commitToken = crypto.randomUUID();
        const write = this.database.prepare(
            `INSERT INTO chronicle_metadata
                (activity_id, document_json, updated_at, commit_token)
             SELECT ?, ?, CURRENT_TIMESTAMP, ? WHERE ${guard.sql}
             ON CONFLICT(activity_id) DO UPDATE SET
                document_json=excluded.document_json,
                commit_token=excluded.commit_token,
                updated_at=CURRENT_TIMESTAMP`
        ).bind(activityId, documentJson, commitToken, ...guard.values);
        const results = await this.database.batch([
            write,
            ...this.chronicleItemStatements(activityId, commitToken, records)
        ]);
        if (results[0]?.meta.changes !== 1) {
            throw new Error('Chronicle metadata references an inactive object');
        }
        return {
            body,
            size: body.byteLength,
            contentType: 'application/json; charset=utf-8',
            etag: `\"${await sha256Hex(body)}\"`,
            uploadedAt: new Date()
        };
    }

    private async putChronicleMetaIfUnchanged(
        activityId: string,
        expectedEtag: string | null,
        body: Uint8Array
    ): Promise<StoredObject | null> {
        const current = await this.database.prepare(
            'SELECT document_json FROM chronicle_metadata WHERE activity_id=?'
        ).bind(activityId).first<{ document_json: string }>();
        const currentBody = current ? new TextEncoder().encode(current.document_json) : null;
        const currentEtag = currentBody ? `"${await sha256Hex(currentBody)}"` : null;
        if (currentEtag !== expectedEtag) return null;

        const documentJson = new TextDecoder().decode(body);
        const records = this.chronicleItemWrites(activityId, JSON.parse(documentJson) as unknown);
        const guard = this.chronicleActiveGuard(records);
        const commitToken = crypto.randomUUID();
        const write = current
            ? this.database.prepare(
                `UPDATE chronicle_metadata
                 SET document_json=?, commit_token=?, updated_at=CURRENT_TIMESTAMP
                 WHERE activity_id=? AND document_json=? AND ${guard.sql}`
            ).bind(documentJson, commitToken, activityId, current.document_json, ...guard.values)
            : this.database.prepare(
                `INSERT OR IGNORE INTO chronicle_metadata
                    (activity_id, document_json, updated_at, commit_token)
                 SELECT ?, ?, CURRENT_TIMESTAMP, ? WHERE ${guard.sql}`
            ).bind(activityId, documentJson, commitToken, ...guard.values);
        const results = await this.database.batch([
            write,
            ...this.chronicleItemStatements(activityId, commitToken, records)
        ]);
        if (results[0]?.meta.changes !== 1) return null;
        return {
            body,
            size: body.byteLength,
            contentType: 'application/json; charset=utf-8',
            etag: `"${await sha256Hex(body)}"`,
            uploadedAt: new Date()
        };
    }

    private async getIndexed(key: string): Promise<StoredObject | null> {
        const index = await this.findPublicReadable(key);
        if (!index) return null;
        const object = await this.bucket.get(physicalKey(index.object_id));
        if (!object) return null;
        const body = await object.bytes();
        return {
            body,
            size: object.size,
            contentType: index.content_type,
            etag: object.httpEtag,
            uploadedAt: object.uploaded
        };
    }

    private async recordCompensation(kind: string, payload: unknown, error: unknown): Promise<void> {
        if (this.compensation) {
            await this.compensation.enqueue(kind, payload, error);
            return;
        }
        await this.database.prepare(
            `INSERT INTO compensation_jobs
                (id, kind, payload_json, state, attempts, last_error)
             VALUES (?, ?, ?, 'pending', 0, ?)`
        ).bind(crypto.randomUUID(), kind, JSON.stringify(payload),
            error instanceof Error ? error.message : String(error)).run();
    }

    private async tombstoneActive(
        key: string,
        index: ObjectIndexRow,
        options: {
            ownerToken?: string;
            referenceGuardSql?: string;
            referenceGuardValues?: string[];
        } = {}
    ): Promise<boolean> {
        const mutationToken = crypto.randomUUID();
        const ownerSql = options.ownerToken === undefined ? '' : 'AND oi.owner_token=?';
        const guardSql = options.referenceGuardSql ? `AND (${options.referenceGuardSql})` : '';
        const values = [
            mutationToken,
            key,
            index.object_id,
            ...(options.ownerToken === undefined ? [] : [options.ownerToken]),
            ...(options.referenceGuardValues || [])
        ];
        const results = await this.database.batch([
            this.database.prepare(
                `UPDATE object_index AS oi
                 SET state='deleted', mutation_token=?, updated_at=CURRENT_TIMESTAMP
                 WHERE oi.logical_key=? AND oi.object_id=?
                   AND oi.state IN ('pending', 'ready') ${ownerSql} ${guardSql}
                   AND (
                    NOT EXISTS (SELECT 1 FROM upload_operations WHERE object_id=oi.object_id)
                    OR EXISTS (
                        SELECT 1 FROM upload_operations u
                        WHERE u.object_id=oi.object_id AND u.logical_key=oi.logical_key
                          AND u.state=oi.state
                    )
                 )`
            ).bind(...values),
            this.database.prepare(
                `UPDATE upload_operations
                 SET state='deleted', target_state='deleted', mutation_token=?,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE object_id=? AND logical_key=? AND state IN ('uploading', 'pending', 'ready')
                   AND EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=? AND state='deleted' AND mutation_token=?
                 )`
            ).bind(
                mutationToken, index.object_id, key,
                key, index.object_id, mutationToken
            )
        ]);
        return results[0]?.meta.changes === 1;
    }

    private async deletePhysical(index: ObjectIndexRow, key: string): Promise<void> {
        try {
            await this.bucket.delete(physicalKey(index.object_id));
        } catch (error) {
            await this.recordCompensation(
                'delete-r2',
                { objectId: index.object_id, logicalKey: key, ownerToken: index.owner_token },
                error
            );
        }
    }

    private async relocateActive(
        sourceKey: string,
        destinationKey: string,
        source: ObjectIndexRow,
        expectedOwnerToken?: string
    ): Promise<boolean> {
        const mutationToken = crypto.randomUUID();
        const moveOperationId = `move-${crypto.randomUUID()}`;
        const targetState = targetStateForKey(destinationKey);
        const recoverySourceKey = destinationKey.startsWith(
            'assets/images/eventchronicle/events/.trash/'
        ) ? sourceKey : null;
        const ownerSql = expectedOwnerToken === undefined ? '' : 'AND oi.owner_token=?';
        const results = await this.database.batch([
            this.database.prepare(
                `UPDATE object_index AS oi SET mutation_token=?
                 WHERE oi.logical_key=? AND oi.object_id=?
                   AND oi.state IN ('pending', 'ready') ${ownerSql}
                   AND NOT EXISTS (
                    SELECT 1 FROM object_index destination
                    WHERE destination.logical_key=? AND destination.state<>'deleted'
                 )
                   AND (
                    NOT EXISTS (SELECT 1 FROM upload_operations WHERE object_id=oi.object_id)
                    OR EXISTS (
                        SELECT 1 FROM upload_operations u
                        WHERE u.object_id=oi.object_id AND u.logical_key=oi.logical_key
                          AND u.state=oi.state
                    )
                 )`
            ).bind(
                mutationToken, sourceKey, source.object_id,
                ...(expectedOwnerToken === undefined ? [] : [expectedOwnerToken]),
                destinationKey
            ),
            this.database.prepare(
                `DELETE FROM object_index
                 WHERE logical_key=? AND state='deleted' AND EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=? AND mutation_token=?
                 )`
            ).bind(destinationKey, sourceKey, source.object_id, mutationToken),
            this.database.prepare(
                `UPDATE object_index
                 SET logical_key=?, state=?, recovery_source_key=?, mutation_token=?,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE logical_key=? AND object_id=? AND mutation_token=?
                   AND state IN ('pending', 'ready')`
            ).bind(
                destinationKey, targetState, recoverySourceKey, mutationToken,
                sourceKey, source.object_id, mutationToken
            ),
            this.database.prepare(
                `INSERT INTO upload_operations
                    (id, scope, idempotency_key, state, logical_key, object_id, sha256,
                     target_state, byte_size, content_type, etag, previous_object_id,
                     previous_mutation_token, previous_state, owner_token, incarnation,
                     mutation_token, recovery_source_key, updated_at)
                 SELECT ?, 'object-move', ?, ?, ?, u.object_id, u.sha256,
                        ?, u.byte_size, u.content_type, u.etag, NULL,
                        NULL, NULL, u.owner_token, u.incarnation, ?, ?, CURRENT_TIMESTAMP
                 FROM upload_operations u
                 WHERE u.logical_key=? AND u.object_id=?
                   AND u.state IN ('pending', 'ready')
                   AND EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=? AND mutation_token=?
                 )
                 ON CONFLICT(id) DO NOTHING`
            ).bind(
                moveOperationId, moveOperationId, targetState, destinationKey,
                targetState, mutationToken, recoverySourceKey,
                sourceKey, source.object_id,
                destinationKey, source.object_id, mutationToken
            ),
            this.database.prepare(
                `UPDATE upload_operations
                 SET state='deleted', target_state='deleted', object_id=NULL,
                     previous_object_id=?, mutation_token=?, recovery_source_key=NULL,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE logical_key=? AND object_id=?
                   AND state IN ('pending', 'ready')
                   AND EXISTS (
                    SELECT 1 FROM upload_operations
                    WHERE id=? AND logical_key=? AND object_id=? AND state=?
                   )`
            ).bind(
                source.object_id, mutationToken,
                sourceKey, source.object_id,
                moveOperationId, destinationKey, source.object_id, targetState
            )
        ]);
        return results[0]?.meta.changes === 1 && results[2]?.meta.changes === 1;
    }

    private async quarantineUpload(operation: UploadOperationRow, error: unknown): Promise<boolean> {
        const message = error instanceof Error ? error.message : String(error);
        const mutationToken = crypto.randomUUID();
        const payload = JSON.stringify({
            objectId: operation.object_id,
            logicalKey: operation.logical_key,
            operationId: operation.id,
            incarnation: operation.incarnation
        });
        const statements: D1PreparedStatement[] = [this.database.prepare(
            `UPDATE upload_operations
             SET state='deleted', target_state='deleted', mutation_token=?,
                 updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND object_id=? AND incarnation=? AND state='uploading'
               AND mutation_token IS ?`
        ).bind(
            mutationToken,
            operation.id,
            operation.object_id,
            operation.incarnation,
            operation.mutation_token
        )];
        if (operation.object_id) {
            statements.push(
                this.database.prepare(
                    `UPDATE object_index
                     SET state='deleted', mutation_token=?, updated_at=CURRENT_TIMESTAMP
                     WHERE object_id=? AND logical_key=?
                       AND EXISTS (
                        SELECT 1 FROM upload_operations
                        WHERE id=? AND object_id=? AND mutation_token=? AND state='deleted'
                       )`
                ).bind(
                    mutationToken, operation.object_id, operation.logical_key,
                    operation.id, operation.object_id, mutationToken
                ),
                this.database.prepare(
                `INSERT OR IGNORE INTO compensation_jobs
                    (id, kind, payload_json, state, attempts, last_error, updated_at)
                 SELECT ?, 'delete-orphan-r2', ?, 'pending', 0, ?, CURRENT_TIMESTAMP
                 WHERE EXISTS (
                    SELECT 1 FROM upload_operations
                    WHERE id=? AND object_id=? AND mutation_token=? AND state='deleted'
                 )`
                ).bind(
                    `stale-upload-${operation.id}-${operation.incarnation}`, payload, message,
                    operation.id, operation.object_id, mutationToken
                )
            );
        }
        const results = await this.database.batch(statements);
        return results[0]?.meta.changes === 1;
    }

    private async recordUploadCleanup(operation: UploadOperationRow, error: unknown): Promise<void> {
        if (!operation.object_id) return;
        await this.recordCompensation('delete-orphan-r2', {
            objectId: operation.object_id,
            logicalKey: operation.logical_key,
            operationId: operation.id,
            incarnation: operation.incarnation
        }, error);
    }

    private async finalizeUpload(
        operation: UploadOperationRow,
        object: R2Object,
        invokeHook: boolean
    ): Promise<void> {
        if (!operation.object_id || !operation.sha256 || !operation.target_state ||
            operation.byte_size === null || !operation.content_type || !operation.mutation_token) {
            throw new Error('Upload operation is missing recovery metadata');
        }
        const mutationToken = crypto.randomUUID();
        const indexed = await this.database.prepare(
            `INSERT INTO object_index
                (logical_key, object_id, state, byte_size, content_type, sha256, etag,
                 owner_token, incarnation, mutation_token, recovery_source_key, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP
             WHERE EXISTS (
                SELECT 1 FROM upload_operations
                WHERE id=? AND object_id=? AND incarnation=? AND state='uploading'
                  AND mutation_token=?
             )
               AND (
                EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=?
                )
                OR (
                    ? IS NULL AND NOT EXISTS (
                        SELECT 1 FROM object_index WHERE logical_key=?
                    )
                )
                OR (
                    ? IS NOT NULL AND EXISTS (
                        SELECT 1 FROM object_index
                        WHERE logical_key=? AND object_id=? AND state=?
                          AND mutation_token IS ?
                    )
                )
               )
             ON CONFLICT(logical_key) DO UPDATE SET
                object_id=excluded.object_id,
                state=excluded.state,
                byte_size=excluded.byte_size,
                content_type=excluded.content_type,
                sha256=excluded.sha256,
                etag=excluded.etag,
                owner_token=excluded.owner_token,
                incarnation=excluded.incarnation,
                mutation_token=excluded.mutation_token,
                recovery_source_key=NULL,
                updated_at=CURRENT_TIMESTAMP
             WHERE object_index.object_id=excluded.object_id
                OR (
                    ? IS NOT NULL AND object_index.object_id=?
                    AND object_index.state=?
                    AND object_index.mutation_token IS ?
                )`
        ).bind(
            operation.logical_key,
            operation.object_id,
            operation.target_state,
            operation.byte_size,
            operation.content_type,
            operation.sha256,
            object.httpEtag,
            operation.owner_token,
            operation.incarnation,
            mutationToken,
            operation.id,
            operation.object_id,
            operation.incarnation,
            operation.mutation_token,
            operation.logical_key,
            operation.object_id,
            operation.previous_state,
            operation.logical_key,
            operation.previous_state,
            operation.logical_key,
            operation.previous_object_id,
            operation.previous_state,
            operation.previous_mutation_token,
            operation.previous_state,
            operation.previous_object_id,
            operation.previous_state,
            operation.previous_mutation_token
        ).run();
        if (indexed.meta.changes !== 1) {
            const error = new Error('A newer object owns the logical key or the upload lease expired');
            if (!await this.quarantineUpload(operation, error)) {
                await this.recordUploadCleanup(operation, error);
            }
            throw new Error('A newer object already owns the logical key');
        }
        if (invokeHook) {
            await this.options.onUploadPhase?.('index-written', this.uploadContext(operation));
        }
        const completed = await this.database.prepare(
            `UPDATE upload_operations
             SET state=?, etag=?, mutation_token=?, recovery_source_key=NULL,
                 updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND state IN ('uploading', ?, ?)
               AND mutation_token=?
               AND EXISTS (
                SELECT 1 FROM object_index
                WHERE logical_key=? AND object_id=? AND incarnation=? AND mutation_token=?
               )`
        ).bind(
            operation.target_state,
            object.httpEtag,
            mutationToken,
            operation.id,
            operation.target_state,
            operation.state,
            operation.mutation_token,
            operation.logical_key,
            operation.object_id,
            operation.incarnation,
            mutationToken
        ).run();
        if (completed.meta.changes !== 1) {
            const error = new Error('Concurrent upload completion');
            const quarantined = await this.quarantineUpload(operation, error);
            await this.database.prepare(
                `UPDATE object_index SET state='deleted', updated_at=CURRENT_TIMESTAMP
                 WHERE logical_key=? AND object_id=? AND mutation_token=?`
            ).bind(operation.logical_key, operation.object_id, mutationToken).run();
            if (!quarantined) await this.recordUploadCleanup(operation, error);
            throw new Error('Concurrent upload completion');
        }
        if (operation.previous_object_id && operation.previous_object_id !== operation.object_id &&
            operation.previous_state && operation.previous_state !== 'deleted') {
            await this.database.prepare(
                `UPDATE upload_operations
                 SET state='deleted', target_state='deleted', mutation_token=?,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE object_id=? AND id<>? AND EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=? AND mutation_token=?
                 ) AND NOT EXISTS (
                    SELECT 1 FROM object_index
                    WHERE object_id=? AND state IN ('pending', 'ready')
                 )`
            ).bind(
                mutationToken, operation.previous_object_id, operation.id,
                operation.logical_key, operation.object_id, mutationToken,
                operation.previous_object_id
            ).run();
        }
    }

    private async cleanupPrevious(operation: UploadOperationRow): Promise<void> {
        if (!operation.previous_object_id || operation.previous_object_id === operation.object_id ||
            !operation.previous_state || operation.previous_state === 'deleted') return;
        const active = await this.database.prepare(
            `SELECT 1 FROM object_index
             WHERE object_id=? AND state IN ('pending', 'ready')
             UNION ALL
             SELECT 1 FROM upload_operations
             WHERE object_id=? AND state IN ('uploading', 'pending', 'ready')
             LIMIT 1`
        ).bind(
            operation.previous_object_id,
            operation.previous_object_id
        ).first<number>('1');
        if (active) return;
        try {
            await this.bucket.delete(physicalKey(operation.previous_object_id));
        } catch (error) {
            await this.recordCompensation(
                'delete-replaced-r2',
                { objectId: operation.previous_object_id, logicalKey: operation.logical_key },
                error
            );
        }
    }

    private async recoverUploadedOperation(
        operation: UploadOperationRow,
        invokeHook: boolean
    ): Promise<R2Object | null> {
        if (!operation.object_id) return null;
        const object = await this.bucket.head(physicalKey(operation.object_id));
        if (!object) return null;
        this.verifyUploadedObject(operation, object);
        await this.finalizeUpload(operation, object, invokeHook);
        await this.cleanupPrevious(operation);
        return object;
    }

    private async hasBusinessReference(logicalKey: string): Promise<boolean> {
        const referenced = await this.database.prepare(
            `SELECT 1 FROM news
             WHERE ltrim(COALESCE(image, ''), '/')=?
                OR ltrim(COALESCE(thumbnail, ''), '/')=?
             UNION ALL
             SELECT 1 FROM events
             WHERE ltrim(COALESCE(image_url, ''), '/')=?
             LIMIT 1`
        ).bind(logicalKey, logicalKey, logicalKey).first<number>('1');
        return referenced === 1;
    }

    private async hasChronicleReference(logicalKey: string): Promise<boolean> {
        return (await this.database.prepare(
            `SELECT 1 FROM chronicle_items
             WHERE logical_key=? AND status IN ('pending', 'ready') LIMIT 1`
        ).bind(logicalKey).first<number>('1')) === 1;
    }

    private async deletePendingIfUnreferenced(
        candidate: PendingPublicationRow,
        referenceGuardSql: string,
        referenceGuardValues: string[]
    ): Promise<boolean> {
        const active = await this.findActive(candidate.logical_key);
        if (!active || active.object_id !== candidate.object_id || active.state !== 'pending') {
            return false;
        }
        await this.options.onRecoveryPhase?.('before-pending-delete-cas', {
            logicalKey: candidate.logical_key,
            objectId: candidate.object_id
        });
        const tombstoned = await this.tombstoneActive(candidate.logical_key, active, {
            referenceGuardSql,
            referenceGuardValues
        });
        if (tombstoned) await this.deletePhysical(active, candidate.logical_key);
        return tombstoned;
    }

    private async recoverPendingPublications(limit: number, staleSeconds: number): Promise<void> {
        const candidates = await this.database.prepare(
            `SELECT oi.logical_key, oi.object_id, oi.updated_at, oi.recovery_source_key
             FROM object_index oi
             WHERE oi.state='pending'
               AND (
                oi.logical_key LIKE 'uploads/news/%'
                OR oi.logical_key LIKE 'uploads/event/%'
                OR (
                    oi.logical_key LIKE 'assets/images/eventchronicle/events/upload/%'
                    AND NOT EXISTS (
                        SELECT 1 FROM chronicle_items ci
                        WHERE ci.logical_key=oi.logical_key
                          AND ci.status IN ('pending', 'ready')
                    )
                )
                OR oi.logical_key LIKE 'assets/images/eventchronicle/events/.trash/%'
               )
             ORDER BY oi.updated_at, oi.logical_key LIMIT ?`
        ).bind(limit).all<PendingPublicationRow>();
        const staleBefore = Date.now() - staleSeconds * 1000;
        for (const candidate of candidates.results) {
            const isBusiness = candidate.logical_key.startsWith('uploads/news/') ||
                candidate.logical_key.startsWith('uploads/event/');
            if (isBusiness && await this.hasBusinessReference(candidate.logical_key)) {
                await this.publish(candidate.logical_key);
                continue;
            }
            const isStale = Date.parse(`${candidate.updated_at.replace(' ', 'T')}Z`) <= staleBefore;
            if (isBusiness) {
                if (!isStale) continue;
                await this.deletePendingIfUnreferenced(
                    candidate,
                    `NOT EXISTS (
                        SELECT 1 FROM news
                        WHERE ltrim(COALESCE(image, ''), '/')=?
                           OR ltrim(COALESCE(thumbnail, ''), '/')=?
                        UNION ALL
                        SELECT 1 FROM events
                        WHERE ltrim(COALESCE(image_url, ''), '/')=?
                    )`,
                    [candidate.logical_key, candidate.logical_key, candidate.logical_key]
                );
                continue;
            }

            if (isChronicleUploadKey(candidate.logical_key)) {
                if (await this.hasChronicleReference(candidate.logical_key) || !isStale) continue;
                await this.deletePendingIfUnreferenced(
                    candidate,
                    `NOT EXISTS (
                        SELECT 1 FROM chronicle_items
                        WHERE logical_key=? AND status IN ('pending', 'ready')
                    )`,
                    [candidate.logical_key]
                );
                continue;
            }

            const sourceKey = candidate.recovery_source_key;
            if (!sourceKey) continue;
            const sourceReferenced = await this.hasChronicleReference(sourceKey);
            const trash = await this.findActive(candidate.logical_key);
            if (!trash || trash.object_id !== candidate.object_id) continue;
            if (sourceReferenced) {
                if (await this.relocateActive(candidate.logical_key, sourceKey, trash)) continue;
                const activeSource = await this.findActive(sourceKey);
                if (!activeSource || !isStale) continue;
                await this.deletePendingIfUnreferenced(
                    candidate,
                    `EXISTS (
                        SELECT 1 FROM chronicle_items
                        WHERE logical_key=? AND status IN ('pending', 'ready')
                    ) AND EXISTS (
                        SELECT 1 FROM object_index
                        WHERE logical_key=? AND state IN ('pending', 'ready')
                    )`,
                    [sourceKey, sourceKey]
                );
                continue;
            }
            if (!isStale) continue;
            await this.deletePendingIfUnreferenced(
                candidate,
                `NOT EXISTS (
                    SELECT 1 FROM chronicle_items
                    WHERE logical_key IN (?, ?) AND status IN ('pending', 'ready')
                )`,
                [candidate.logical_key, sourceKey]
            );
        }
    }

    private async recoverReadyOrphans(limit: number, staleSeconds: number): Promise<void> {
        const staleBefore = `-${staleSeconds} seconds`;
        const candidates = await this.database.prepare(
            `SELECT oi.logical_key, oi.object_id, oi.updated_at, oi.recovery_source_key
             FROM object_index oi
             WHERE oi.state='ready' AND oi.updated_at <= datetime('now', ?)
               AND (
                oi.logical_key LIKE 'uploads/news/%'
                OR oi.logical_key LIKE 'uploads/event/%'
                OR oi.logical_key LIKE 'assets/images/eventchronicle/events/used/%'
                OR oi.logical_key LIKE 'uploads/namecard/original/%'
               )
               AND NOT EXISTS (
                    SELECT 1 FROM news
                    WHERE ltrim(COALESCE(image, ''), '/')=oi.logical_key
                       OR ltrim(COALESCE(thumbnail, ''), '/')=oi.logical_key
                    UNION ALL
                    SELECT 1 FROM events
                    WHERE ltrim(COALESCE(image_url, ''), '/')=oi.logical_key
                    UNION ALL
                    SELECT 1 FROM cards
                    WHERE ltrim(image1_url, '/')=oi.logical_key
                       OR ltrim(image2_url, '/')=oi.logical_key
                    UNION ALL
                    SELECT 1 FROM chronicle_items
                    WHERE logical_key=oi.logical_key AND status IN ('pending', 'ready')
               )
             ORDER BY oi.updated_at, oi.logical_key LIMIT ?`
        ).bind(staleBefore, limit).all<PendingPublicationRow>();
        for (const candidate of candidates.results) {
            const active = await this.findActive(candidate.logical_key);
            if (!active || active.object_id !== candidate.object_id || active.state !== 'ready') {
                continue;
            }
            const guard = {
                referenceGuardSql: `NOT EXISTS (
                    SELECT 1 FROM news
                    WHERE ltrim(COALESCE(image, ''), '/')=?
                       OR ltrim(COALESCE(thumbnail, ''), '/')=?
                    UNION ALL
                    SELECT 1 FROM events
                    WHERE ltrim(COALESCE(image_url, ''), '/')=?
                    UNION ALL
                    SELECT 1 FROM cards
                    WHERE ltrim(image1_url, '/')=? OR ltrim(image2_url, '/')=?
                    UNION ALL
                    SELECT 1 FROM chronicle_items
                    WHERE logical_key=? AND status IN ('pending', 'ready')
                )`,
                referenceGuardValues: Array<string>(6).fill(candidate.logical_key)
            };
            const tombstoned = await this.tombstoneActive(
                candidate.logical_key,
                active,
                guard
            );
            if (tombstoned) await this.deletePhysical(active, candidate.logical_key);
        }
    }

    async recoverStaleUploads(limit = 10, staleSeconds = 300): Promise<void> {
        if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(staleSeconds) || staleSeconds < 0) {
            throw new Error('Invalid stale-upload scan bounds');
        }
        const staleBefore = `-${staleSeconds} seconds`;
        const candidates = await this.database.prepare(
            `SELECT id, state, logical_key, object_id, sha256, target_state,
                    byte_size, content_type, etag, previous_object_id, previous_mutation_token,
                    previous_state,
                    owner_token, incarnation,
                    mutation_token, recovery_source_key
             FROM upload_operations
             WHERE state='uploading' AND updated_at <= datetime('now', ?)
             ORDER BY updated_at, id LIMIT ?`
        ).bind(staleBefore, limit).all<UploadOperationRow>();
        for (const candidate of candidates.results) {
            const claimed = await this.claimUploadExecution(candidate, staleBefore);
            if (!claimed) continue;
            try {
                const recovered = await this.recoverUploadedOperation(claimed, false);
                if (!recovered) throw new Error('Stale upload object is missing');
            } catch (error) {
                await this.quarantineUpload(claimed, error);
            }
        }
        await this.recoverPendingPublications(limit, staleSeconds);
        await this.recoverReadyOrphans(
            limit,
            Math.max(staleSeconds, READY_ORPHAN_GRACE_SECONDS)
        );
    }

    async get(key: string): Promise<StoredObject | null> {
        const activityId = chronicleMetaActivity(key);
        if (activityId) return this.getChronicleMeta(activityId);
        if (isChronicleUsedKey(key)) {
            const visible = await this.database.prepare(
                "SELECT 1 FROM chronicle_items WHERE logical_key=? AND status='ready'"
            ).bind(key).first<number>('1');
            if (!visible) return null;
        }
        return this.getIndexed(key);
    }

    async put(key: string, body: Uint8Array, options: PutObjectOptions = {}): Promise<StoredObject> {
        const activityId = chronicleMetaActivity(key);
        if (activityId) return this.putChronicleMeta(activityId, body);
        const digest = await sha256Hex(body);
        if (options.sha256 && options.sha256.toLowerCase() !== digest) {
            throw new Error('SHA-256 mismatch');
        }
        const predecessor = await this.findIndexSnapshot(key);
        const { operationId, baseObjectId } = await this.uploadIdentity(key, digest);
        const contentType = options.contentType || 'application/octet-stream';
        const targetState = options.deferredPublication ? 'pending' : targetStateForKey(key);
        await this.database.prepare(
            `INSERT INTO upload_operations
                (id, scope, idempotency_key, state, logical_key, object_id, sha256,
                 target_state, byte_size, content_type, previous_object_id,
                 previous_mutation_token, previous_state, owner_token, incarnation)
             VALUES (?, 'object-put', ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO NOTHING`
        ).bind(
            operationId,
            operationId,
            key,
            baseObjectId,
            digest,
            targetState,
            body.byteLength,
            contentType,
            predecessor?.object_id ?? null,
            predecessor?.mutation_token ?? null,
            predecessor?.state ?? null,
            options.ownerToken ?? null
        ).run();
        let operation = await this.findUploadOperation(operationId);
        if (!operation) throw new Error('Upload operation was not persisted');
        if (operation.state !== 'deleted' && operation.logical_key !== key &&
            operation.object_id && operation.sha256 === digest &&
            ['pending', 'ready'].includes(operation.state)) {
            const movedFromKey = operation.logical_key;
            const movedObjectId = operation.object_id;
            const movedState = operation.state;
            const movedMutationToken = operation.mutation_token;
            const nextIncarnation = operation.incarnation + 1;
            const nextObjectId = this.incarnationObjectId(baseObjectId, nextIncarnation);
            await this.database.prepare(
                `UPDATE upload_operations
                 SET state='uploading', logical_key=?, object_id=?, sha256=?, incarnation=?,
                     target_state=?, byte_size=?, content_type=?, etag=NULL,
                     previous_object_id=?, previous_mutation_token=?, previous_state=?,
                     owner_token=?, mutation_token=NULL, recovery_source_key=NULL,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE id=? AND logical_key=? AND object_id=? AND incarnation=? AND state=?
                   AND mutation_token IS ?
                   AND EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=? AND state=? AND mutation_token IS ?
                   )`
            ).bind(
                key,
                nextObjectId,
                digest,
                nextIncarnation,
                targetState,
                body.byteLength,
                contentType,
                predecessor?.object_id ?? null,
                predecessor?.mutation_token ?? null,
                predecessor?.state ?? null,
                options.ownerToken ?? null,
                operationId,
                movedFromKey,
                movedObjectId,
                operation.incarnation,
                movedState,
                movedMutationToken,
                movedFromKey,
                movedObjectId,
                movedState,
                movedMutationToken
            ).run();
            operation = await this.findUploadOperation(operationId);
            if (!operation) throw new Error('Moved upload identity reset failed');
        }
        if (operation.state === 'deleted') {
            const nextIncarnation = operation.incarnation + 1;
            const nextObjectId = this.incarnationObjectId(baseObjectId, nextIncarnation);
            await this.database.prepare(
                `UPDATE upload_operations
                 SET state='uploading', logical_key=?, object_id=?, sha256=?, incarnation=?, target_state=?,
                     byte_size=?, content_type=?, etag=NULL, previous_object_id=?,
                     previous_mutation_token=?, previous_state=?,
                     owner_token=?, mutation_token=NULL, recovery_source_key=NULL,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE id=? AND state='deleted' AND incarnation=?`
            ).bind(
                key,
                nextObjectId,
                digest,
                nextIncarnation,
                targetState,
                body.byteLength,
                contentType,
                predecessor?.object_id ?? null,
                predecessor?.mutation_token ?? null,
                predecessor?.state ?? null,
                options.ownerToken ?? null,
                operationId,
                operation.incarnation
            ).run();
            operation = await this.findUploadOperation(operationId);
            if (!operation) throw new Error('Upload operation reset failed');
        }
        const expectedObjectId = this.incarnationObjectId(baseObjectId, operation.incarnation);
        if (
            operation.logical_key !== key || operation.object_id !== expectedObjectId ||
            operation.sha256 !== digest || operation.target_state !== targetState ||
            operation.byte_size !== body.byteLength || operation.content_type !== contentType ||
            operation.owner_token !== (options.ownerToken ?? null)
        ) {
            throw new Error('Stable upload operation metadata conflict');
        }

        if (operation.state !== 'uploading') {
            const indexed = await this.findActive(key);
            const completed = operation.object_id
                ? await this.bucket.head(physicalKey(operation.object_id))
                : null;
            if (!indexed || indexed.object_id !== operation.object_id ||
                indexed.state !== operation.state || !completed) {
                throw new Error('Completed upload operation is missing its active object');
            }
            this.verifyUploadedObject(operation, completed);
            return {
                body,
                size: body.byteLength,
                contentType,
                etag: completed.httpEtag,
                uploadedAt: completed.uploaded
            };
        }
        const claimed = await this.claimUploadExecution(operation);
        if (!claimed) throw new Error('Concurrent upload execution');
        operation = claimed;
        try {
            await this.options.onUploadPhase?.('operation-created', this.uploadContext(operation));
            let uploaded = await this.recoverUploadedOperation(operation, true);
            if (!uploaded) {
                uploaded = await this.bucket.put(physicalKey(expectedObjectId), body, {
                    sha256: digest,
                    httpMetadata: { contentType },
                    customMetadata: {
                        ...options.metadata,
                        logicalKey: key,
                        sha256: digest,
                        ...(options.ownerToken ? { ownerToken: options.ownerToken } : {})
                    }
                });
                await this.options.onUploadPhase?.('object-uploaded', this.uploadContext(operation));
                try {
                    this.verifyUploadedObject(operation, uploaded);
                } catch (error) {
                    await this.quarantineUpload(operation, error);
                    throw error;
                }
                await this.finalizeUpload(operation, uploaded, true);
                await this.cleanupPrevious(operation);
            }
            return {
                body,
                size: body.byteLength,
                contentType,
                etag: uploaded.httpEtag,
                uploadedAt: uploaded.uploaded
            };
        } catch (error) {
            await this.releaseUploadExecution(operation);
            throw error;
        }
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        const activityId = chronicleMetaActivity(key);
        if (activityId) return this.putChronicleMetaIfUnchanged(activityId, expectedEtag, body);
        const current = await this.get(key);
        if ((current?.etag ?? null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }

    async delete(key: string): Promise<void> {
        const activityId = chronicleMetaActivity(key);
        if (activityId) {
            await this.database.batch([
                this.database.prepare('DELETE FROM chronicle_metadata WHERE activity_id=?').bind(activityId),
                this.database.prepare('DELETE FROM chronicle_items WHERE activity_id=?').bind(activityId)
            ]);
            return;
        }
        const index = await this.findActive(key);
        if (!index) return;
        await this.options.onMutationPhase?.('delete-read', {
            logicalKey: key,
            objectId: index.object_id
        });
        if (!await this.tombstoneActive(key, index)) return;
        await this.deletePhysical(index, key);
    }

    async deleteIfObjectId(key: string, expectedObjectId: string): Promise<boolean> {
        if (!expectedObjectId || chronicleMetaActivity(key)) return false;
        const active = await this.findActive(key);
        if (!active || active.object_id !== expectedObjectId) return false;
        await this.options.onMutationPhase?.('delete-read', {
            logicalKey: key,
            objectId: active.object_id
        });
        if (!await this.tombstoneActive(key, active)) return false;
        await this.deletePhysical(active, key);
        return true;
    }

    async deleteIfOwned(key: string, expectedOwnerToken: string): Promise<boolean> {
        if (!expectedOwnerToken || chronicleMetaActivity(key)) return false;
        const index = await this.database.prepare(
            `SELECT object_id FROM object_index
             WHERE logical_key=? AND owner_token=? AND state IN ('pending', 'ready')`
        ).bind(key, expectedOwnerToken).first<Pick<ObjectIndexRow, 'object_id'>>();
        if (!index) return false;
        const active = await this.findActive(key);
        if (!active || active.object_id !== index.object_id) return false;
        await this.options.onMutationPhase?.('delete-read', {
            logicalKey: key,
            objectId: active.object_id
        });
        if (!await this.tombstoneActive(key, active, { ownerToken: expectedOwnerToken })) return false;
        await this.deletePhysical(active, key);
        return true;
    }

    async publish(key: string): Promise<void> {
        const index = await this.database.prepare(
            `SELECT object_id, state FROM object_index WHERE logical_key=?`
        ).bind(key).first<Pick<ObjectIndexRow, 'object_id' | 'state'>>();
        if (!index || index.state === 'deleted' || index.state === 'uploading') {
            throw new Error('Pending object not found');
        }
        if (index.state === 'ready') return;
        const requiresBusinessReference = key.startsWith('uploads/news/') ||
            key.startsWith('uploads/event/');
        if (requiresBusinessReference && !(await this.hasBusinessReference(key))) {
            throw new Error('Business reference required before object publication');
        }
        const mutationToken = crypto.randomUUID();
        const publishIndex = requiresBusinessReference
            ? this.database.prepare(
                `UPDATE object_index
                 SET state='ready', mutation_token=?, updated_at=CURRENT_TIMESTAMP
                 WHERE logical_key=? AND object_id=? AND state='pending'
                   AND EXISTS (
                    SELECT 1 FROM upload_operations
                    WHERE logical_key=? AND object_id=? AND state='pending'
                   )
                   AND EXISTS (
                    SELECT 1 FROM news
                    WHERE ltrim(COALESCE(image, ''), '/')=?
                       OR ltrim(COALESCE(thumbnail, ''), '/')=?
                    UNION ALL
                    SELECT 1 FROM events
                    WHERE ltrim(COALESCE(image_url, ''), '/')=?
                 )`
            ).bind(
                mutationToken, key, index.object_id, key, index.object_id,
                key, key, key
            )
            : this.database.prepare(
                `UPDATE object_index
                 SET state='ready', mutation_token=?, updated_at=CURRENT_TIMESTAMP
                 WHERE logical_key=? AND object_id=? AND state='pending'
                   AND EXISTS (
                    SELECT 1 FROM upload_operations
                    WHERE logical_key=? AND object_id=? AND state='pending'
                   )`
            ).bind(mutationToken, key, index.object_id, key, index.object_id);
        const results = await this.database.batch([
            publishIndex,
            this.database.prepare(
                `UPDATE upload_operations
                 SET state='ready', target_state='ready', mutation_token=?,
                     updated_at=CURRENT_TIMESTAMP
                 WHERE logical_key=? AND object_id=? AND state='pending'
                   AND EXISTS (
                    SELECT 1 FROM object_index
                    WHERE logical_key=? AND object_id=? AND state='ready' AND mutation_token=?
                   )`
            ).bind(
                mutationToken, key, index.object_id,
                key, index.object_id, mutationToken
            )
        ]);
        if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
            throw new Error('Concurrent object publication');
        }
    }

    async exists(key: string): Promise<boolean> {
        return (await this.findActive(key)) !== null;
    }

    async copy(sourceKey: string, destinationKey: string): Promise<void> {
        const source = chronicleMetaActivity(sourceKey)
            ? await this.get(sourceKey)
            : await this.findActive(sourceKey).then(async (index) => {
                if (!index) return null;
                const object = await this.bucket.get(physicalKey(index.object_id));
                if (!object) return null;
                return {
                    body: await object.bytes(),
                    size: object.size,
                    contentType: index.content_type,
                    etag: object.httpEtag,
                    uploadedAt: object.uploaded
                } satisfies StoredObject;
            });
        if (!source) throw new Error('Source object not found');
        await this.put(destinationKey, source.body, {
            contentType: source.contentType,
            sha256: await sha256Hex(source.body)
        });
    }

    async move(sourceKey: string, destinationKey: string): Promise<void> {
        if (chronicleMetaActivity(sourceKey) || chronicleMetaActivity(destinationKey)) {
            await this.copy(sourceKey, destinationKey);
            await this.delete(sourceKey);
            return;
        }
        const source = await this.findActive(sourceKey);
        if (!source) throw new Error('Source object not found');
        await this.options.onMutationPhase?.('move-read', {
            logicalKey: sourceKey,
            objectId: source.object_id
        });
        if (await this.relocateActive(sourceKey, destinationKey, source)) return;
        const destination = await this.findActive(destinationKey);
        if (destination?.object_id === source.object_id) return;
        if (destination) throw new Error('Destination object already exists');
        throw new Error('Concurrent object move');
    }

    async moveIfOwned(
        sourceKey: string,
        destinationKey: string,
        expectedOwnerToken: string
    ): Promise<boolean> {
        if (!expectedOwnerToken || !isChronicleManagedKey(sourceKey) ||
            !isChronicleManagedKey(destinationKey)) return false;
        const source = await this.findActive(sourceKey);
        if (source?.owner_token !== expectedOwnerToken) return false;
        if (!source) return false;
        await this.options.onMutationPhase?.('move-read', {
            logicalKey: sourceKey,
            objectId: source.object_id
        });
        if (await this.relocateActive(
            sourceKey,
            destinationKey,
            source,
            expectedOwnerToken
        )) return true;
        const destination = await this.findActive(destinationKey);
        return destination?.object_id === source.object_id &&
            destination.owner_token === expectedOwnerToken;
    }

    async list(prefix: string): Promise<ListedObject[]> {
        if (prefix === 'assets/images/eventchronicle/events/meta' ||
            prefix === 'assets/images/eventchronicle/events/meta/') {
            const result = await this.database.prepare(
                'SELECT activity_id, document_json FROM chronicle_metadata ORDER BY activity_id'
            ).all<{ activity_id: string; document_json: string }>();
            return Promise.all(result.results.map(async (row) => ({
                key: `assets/images/eventchronicle/events/meta/${row.activity_id}.json`,
                size: new TextEncoder().encode(row.document_json).byteLength,
                etag: `\"${await sha256Hex(new TextEncoder().encode(row.document_json))}\"`
            })));
        }
        if (prefix.startsWith('assets/images/eventchronicle/events/used')) {
            const result = await this.database.prepare(
                `SELECT oi.logical_key, oi.byte_size, oi.etag
                 FROM object_index oi
                 JOIN chronicle_items ci ON ci.logical_key=oi.logical_key
                 LEFT JOIN upload_operations u ON u.object_id=oi.object_id
                 WHERE oi.state='ready' AND ci.status='ready'
                   AND (u.id IS NULL OR u.state='ready')
                   AND oi.logical_key LIKE ? ESCAPE '\\'
                 ORDER BY oi.logical_key`
            ).bind(`${escapeLike(prefix)}%`).all<{
                logical_key: string;
                byte_size: number;
                etag: string | null;
            }>();
            return result.results.map((row) => ({
                key: row.logical_key,
                size: row.byte_size,
                etag: row.etag || ''
            }));
        }
        const result = await this.database.prepare(
            `SELECT oi.logical_key, oi.byte_size, oi.etag FROM object_index oi
             LEFT JOIN upload_operations u ON u.object_id=oi.object_id
             WHERE oi.state='ready' AND (u.id IS NULL OR u.state='ready')
               AND oi.logical_key LIKE ? ESCAPE '\\'
             ORDER BY oi.logical_key`
        ).bind(`${escapeLike(prefix)}%`).all<{
            logical_key: string;
            byte_size: number;
            etag: string | null;
        }>();
        return result.results.map((row) => ({
            key: row.logical_key,
            size: row.byte_size,
            etag: row.etag || ''
        }));
    }

    async deletePrefix(prefix: string): Promise<void> {
        for (const object of await this.list(prefix)) await this.delete(object.key);
    }
}

export async function fetchFinalR2Object(
    database: D1Database,
    bucket: R2Bucket,
    logicalKey: string,
    request: Request
): Promise<Response | null> {
    const index = await database.prepare(
        `SELECT oi.object_id, oi.byte_size, oi.content_type, oi.etag
         FROM object_index oi
         LEFT JOIN upload_operations u ON u.object_id=oi.object_id
         WHERE oi.logical_key=? AND oi.state='ready'
           AND (u.id IS NULL OR u.state='ready')`
    ).bind(logicalKey).first<Pick<ObjectIndexRow, 'object_id' | 'byte_size' | 'content_type' | 'etag'>>();
    if (!index) return null;

    const requestedRange = parseRange(request.headers.get('range'), index.byte_size);
    if (requestedRange === 'invalid') {
        return new Response(null, {
            status: 416,
            headers: {
                'Accept-Ranges': 'bytes',
                'Content-Type': index.content_type,
                'Content-Range': `bytes */${index.byte_size}`,
                'ETag': index.etag || ''
            }
        });
    }

    if (request.method === 'HEAD') {
        const head = await bucket.head(physicalKey(index.object_id));
        if (!head) return null;
        return storedObjectResponse(request, {
            body: new Uint8Array(),
            size: index.byte_size,
            contentType: index.content_type,
            etag: head.httpEtag,
            uploadedAt: head.uploaded
        });
    }

    const hasRange = request.headers.has('range');
    const hasConditions = [
        'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since'
    ].some((header) => request.headers.has(header));
    let object: R2ObjectBody | R2Object | null;
    if (hasConditions) {
        const options: R2GetOptions & { onlyIf: R2Conditional | Headers } = {
            onlyIf: request.headers
        };
        if (hasRange) options.range = request.headers;
        object = await bucket.get(physicalKey(index.object_id), options);
    } else if (hasRange) {
        object = await bucket.get(physicalKey(index.object_id), { range: request.headers });
    } else {
        // Passing even empty Headers to Miniflare creates a synthetic full range.
        object = await bucket.get(physicalKey(index.object_id));
    }
    if (!object) return null;
    if (!('body' in object)) {
        return new Response(null, {
            status: request.headers.has('if-none-match') ? 304 : 412,
            headers: { ETag: object.httpEtag }
        });
    }
    const headers = new Headers({
        'Content-Type': index.content_type,
        'ETag': object.httpEtag,
        'Accept-Ranges': 'bytes'
    });
    object.writeHttpMetadata(headers);
    let status = 200;
    if (requestedRange) {
        status = 206;
        const length = requestedRange.end - requestedRange.start + 1;
        headers.set('Content-Range', `bytes ${requestedRange.start}-${requestedRange.end}/${index.byte_size}`);
        headers.set('Content-Length', String(length));
    } else {
        headers.set('Content-Length', String(index.byte_size));
    }
    return new Response(object.body, { status, headers });
}
