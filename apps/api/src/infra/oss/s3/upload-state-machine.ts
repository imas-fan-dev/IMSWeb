import crypto from 'node:crypto';
import type { ManagedSqlDatabase, SqlStatement } from '@/infra/db/sql/database';

export type S3UploadState = 'uploading' | 'pending' | 'ready' | 'deleted';
export type S3PublishedObjectState = 'pending' | 'ready';

export interface S3ObjectVersion {
    objectId: string;
    physicalKey: string | null;
    size: number;
    contentType: string;
    sha256: string;
    etag: string;
    ownerToken: string | null;
}

export interface S3ObjectSnapshot extends S3ObjectVersion {
    logicalKey: string;
    state: S3UploadState;
    incarnation: number;
    operationId: string | null;
}

export interface S3UploadOperation {
    id: string;
    logicalKey: string;
    objectId: string;
    physicalKey: string;
    targetState: S3PublishedObjectState;
    previousObjectId: string | null;
    previousState: S3UploadState | null;
    previousOperationId: string | null;
    previousIncarnation: number | null;
}

interface ObjectIndexRow {
    logical_key: string;
    object_id: string;
    state: S3UploadState;
    incarnation: number;
    operation_id: string | null;
}

interface ObjectVersionRow {
    object_id: string;
    physical_key: string | null;
    byte_size: number;
    content_type: string;
    sha256: string;
    etag: string;
    owner_token: string | null;
}

interface ReadableObjectVersionRow extends ObjectVersionRow {
    logical_key: string;
}

export interface S3StaleUpload {
    id: string;
    state: S3UploadState;
    logical_key: string;
    object_id: string;
    physical_key: string | null;
    target_state: S3PublishedObjectState;
    previous_object_id: string | null;
    previous_state: S3UploadState | null;
    previous_operation_id: string | null;
    previous_incarnation: number | null;
}

const TRANSITIONS: Record<S3UploadState, ReadonlySet<S3UploadState>> = {
    uploading: new Set(['pending', 'ready', 'deleted']),
    pending: new Set(['ready', 'deleted']),
    ready: new Set(['deleted']),
    deleted: new Set(['deleted'])
};

const SQLITE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS s3_object_versions (
        object_id TEXT PRIMARY KEY,
        physical_key TEXT,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        content_type TEXT NOT NULL,
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
        etag TEXT NOT NULL,
        owner_token TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS s3_object_index (
        logical_key TEXT PRIMARY KEY,
        object_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
        incarnation INTEGER NOT NULL CHECK (incarnation >= 1),
        operation_id TEXT,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_s3_object_index_state_key
        ON s3_object_index(state, logical_key);
    CREATE TABLE IF NOT EXISTS s3_upload_operations (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
        logical_key TEXT NOT NULL,
        object_id TEXT NOT NULL UNIQUE,
        physical_key TEXT,
        target_state TEXT NOT NULL CHECK (target_state IN ('pending', 'ready')),
        previous_object_id TEXT,
        previous_state TEXT CHECK (
            previous_state IS NULL OR previous_state IN ('uploading', 'pending', 'ready', 'deleted')
        ),
        previous_operation_id TEXT,
        previous_incarnation INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_s3_upload_operations_stale
        ON s3_upload_operations(state, updated_at);
    CREATE TABLE IF NOT EXISTS s3_compensation_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        last_error TEXT,
        next_attempt_at INTEGER,
        lease_expires_at INTEGER,
        quarantined_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_s3_compensation_jobs_schedule
        ON s3_compensation_jobs(quarantined_at, state, next_attempt_at, attempts, created_at);
`;

const REQUIRED_POSTGRESQL_MIGRATION = '0006_s3_semantic_physical_keys';

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function version(row: ObjectVersionRow): S3ObjectVersion {
    return {
        objectId: row.object_id,
        physicalKey: row.physical_key,
        size: row.byte_size,
        contentType: row.content_type,
        sha256: row.sha256,
        etag: row.etag,
        ownerToken: row.owner_token
    };
}

export class S3UploadStateMachine {
    private initialized?: Promise<void>;

    constructor(private readonly database: ManagedSqlDatabase) {}

    initialize(): Promise<void> {
        this.initialized ??= this.initializeCurrentDialect();
        return this.initialized;
    }

    private async initializeCurrentDialect(): Promise<void> {
        if (this.database.dialect === 'sqlite') {
            await this.database.executeScript(SQLITE_SCHEMA);
            await this.addSqliteColumnIfMissing(
                's3_object_versions',
                'physical_key',
                'TEXT'
            );
            await this.addSqliteColumnIfMissing(
                's3_upload_operations',
                'physical_key',
                'TEXT'
            );
            return;
        }
        const migration = await this.database.prepare(
            'SELECT version FROM ims_schema_migrations WHERE version=?'
        ).bind(REQUIRED_POSTGRESQL_MIGRATION).first<{ version: string }>();
        if (!migration) {
            throw new Error(
                `PostgreSQL schema migration ${REQUIRED_POSTGRESQL_MIGRATION} is required; ` +
                'run pnpm run migration:postgresql'
            );
        }
    }

    private async addSqliteColumnIfMissing(
        table: string,
        column: string,
        definition: string
    ): Promise<void> {
        const columns = await this.database.prepare(`PRAGMA table_info(${table})`)
            .all<{ name: string }>();
        if (columns.results.some((candidate) => candidate.name === column)) return;
        await this.database.prepare(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        ).run();
    }

    private async index(logicalKey: string): Promise<ObjectIndexRow | null> {
        return this.database.prepare(
            'SELECT * FROM s3_object_index WHERE logical_key=?'
        ).bind(logicalKey).first<ObjectIndexRow>();
    }

    private async objectVersion(objectId: string): Promise<S3ObjectVersion | null> {
        const row = await this.database.prepare(
            'SELECT * FROM s3_object_versions WHERE object_id=?'
        ).bind(objectId).first<ObjectVersionRow>();
        return row ? version(row) : null;
    }

    private async operation(operationId: string): Promise<S3StaleUpload | null> {
        return this.database.prepare(
            'SELECT * FROM s3_upload_operations WHERE id=?'
        ).bind(operationId).first<S3StaleUpload>();
    }

    private cleanupJob(
        objectId: string,
        physicalKey: string | null,
        now: number
    ): SqlStatement {
        return this.database.prepare(
            `INSERT INTO s3_compensation_jobs
                (id, kind, payload_json, state, attempts, next_attempt_at, created_at, updated_at)
             VALUES (?, 'delete-s3-object', ?, 'pending', 0, ?, ?, ?)`
        ).bind(
            crypto.randomUUID(),
            JSON.stringify({ objectId, physicalKey }),
            now,
            now,
            now
        );
    }

    async isManaged(logicalKey: string): Promise<boolean> {
        return Boolean(await this.index(logicalKey));
    }

    async mutationIdentity(logicalKey: string): Promise<string | null> {
        return (await this.index(logicalKey))?.object_id ?? null;
    }

    async snapshot(logicalKey: string): Promise<S3ObjectSnapshot | null> {
        const index = await this.index(logicalKey);
        if (!index) return null;
        const object = await this.objectVersion(index.object_id);
        if (!object) {
            if (index.state === 'deleted') return null;
            throw new Error(`S3 object metadata is missing: ${index.object_id}`);
        }
        return {
            logicalKey,
            ...object,
            state: index.state,
            incarnation: index.incarnation,
            operationId: index.operation_id
        };
    }

    async readable(logicalKey: string): Promise<S3ObjectVersion | null> {
        let current = await this.index(logicalKey);
        const visited = new Set<string>();
        while (current) {
            if (current.state === 'deleted' || current.state === 'uploading') return null;
            if (current.state === 'ready') return this.objectVersion(current.object_id);
            if (!current.operation_id || visited.has(current.operation_id)) return null;
            visited.add(current.operation_id);
            const operation = await this.operation(current.operation_id);
            if (!operation?.previous_object_id || !operation.previous_state) return null;
            current = {
                logical_key: logicalKey,
                object_id: operation.previous_object_id,
                state: operation.previous_state,
                incarnation: operation.previous_incarnation ?? 1,
                operation_id: operation.previous_operation_id
            };
        }
        return null;
    }

    async physicalKey(objectId: string): Promise<string | null> {
        const object = await this.objectVersion(objectId);
        if (object?.physicalKey) return object.physicalKey;
        const operation = await this.database.prepare(
            `SELECT physical_key FROM s3_upload_operations
             WHERE object_id=? ORDER BY created_at DESC LIMIT 1`
        ).bind(objectId).first<{ physical_key: string | null }>();
        return operation?.physical_key ?? null;
    }

    async supersededObjectIds(operation: S3UploadOperation | S3StaleUpload): Promise<string[]> {
        const objectIds: string[] = [];
        let previousObjectId = 'previousObjectId' in operation
            ? operation.previousObjectId
            : operation.previous_object_id;
        let previousState = 'previousState' in operation
            ? operation.previousState
            : operation.previous_state;
        let previousOperationId = 'previousOperationId' in operation
            ? operation.previousOperationId
            : operation.previous_operation_id;
        const visited = new Set<string>();
        while (previousObjectId && previousState && ['pending', 'ready'].includes(previousState)) {
            objectIds.push(previousObjectId);
            if (previousState === 'ready' || !previousOperationId ||
                visited.has(previousOperationId)) {
                break;
            }
            visited.add(previousOperationId);
            const previous = await this.operation(previousOperationId);
            if (!previous) break;
            previousObjectId = previous.previous_object_id;
            previousState = previous.previous_state;
            previousOperationId = previous.previous_operation_id;
        }
        return objectIds;
    }

    async listReadable(prefix: string): Promise<Array<S3ObjectVersion & { logicalKey: string }>> {
        const rows = await this.database.prepare(
            `WITH RECURSIVE readable_index(logical_key, object_id, state, operation_id) AS (
                SELECT logical_key, object_id, state, operation_id
                FROM s3_object_index
                WHERE state IN ('pending', 'ready')
                  AND logical_key LIKE ? ESCAPE '\\'
                UNION
                SELECT current.logical_key,
                       operation.previous_object_id,
                       operation.previous_state,
                       operation.previous_operation_id
                FROM readable_index AS current
                JOIN s3_upload_operations AS operation
                  ON operation.id=current.operation_id
                WHERE current.state='pending'
                  AND operation.previous_object_id IS NOT NULL
                  AND operation.previous_state IS NOT NULL
             )
             SELECT readable_index.logical_key, versions.*
             FROM readable_index
             JOIN s3_object_versions AS versions
               ON versions.object_id=readable_index.object_id
             WHERE readable_index.state='ready'
             ORDER BY readable_index.logical_key`
        ).bind(`${escapeLike(prefix)}%`).all<ReadableObjectVersionRow>();
        return rows.results.map((row) => ({
            logicalKey: row.logical_key,
            ...version(row)
        }));
    }

    async beginUpload(
        logicalKey: string,
        objectId: string,
        physicalKey: string,
        targetState: S3PublishedObjectState
    ): Promise<S3UploadOperation> {
        await this.initialize();
        const previous = await this.index(logicalKey);
        const id = crypto.randomUUID();
        const now = Date.now();
        await this.database.prepare(
            `INSERT INTO s3_upload_operations
                (id, state, logical_key, object_id, physical_key, target_state,
                 previous_object_id, previous_state, previous_operation_id,
                 previous_incarnation, created_at, updated_at)
             VALUES (?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            id,
            logicalKey,
            objectId,
            physicalKey,
            targetState,
            previous?.object_id ?? null,
            previous?.state ?? null,
            previous?.operation_id ?? null,
            previous?.incarnation ?? null,
            now,
            now
        ).run();
        return {
            id,
            logicalKey,
            objectId,
            physicalKey,
            targetState,
            previousObjectId: previous?.object_id ?? null,
            previousState: previous?.state ?? null,
            previousOperationId: previous?.operation_id ?? null,
            previousIncarnation: previous?.incarnation ?? null
        };
    }

    async completeUpload(
        operation: S3UploadOperation,
        object: Omit<S3ObjectVersion, 'objectId' | 'physicalKey'>
    ): Promise<boolean> {
        const now = Date.now();
        const nextIncarnation = (operation.previousIncarnation ?? 0) + 1;
        const supersededObjectIds = operation.targetState === 'ready'
            ? await this.supersededObjectIds(operation)
            : [];
        const supersededObjects = await Promise.all(supersededObjectIds.map(async (objectId) => ({
            objectId,
            physicalKey: await this.physicalKey(objectId)
        })));
        const indexStatement = operation.previousObjectId === null
            ? this.database.prepare(
                `INSERT INTO s3_object_index
                    (logical_key, object_id, state, incarnation, operation_id, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(logical_key) DO UPDATE SET
                    object_id=excluded.object_id,
                    state=excluded.state,
                    incarnation=excluded.incarnation,
                    operation_id=excluded.operation_id,
                    updated_at=excluded.updated_at
                 WHERE 0=1`
            ).bind(
                operation.logicalKey,
                operation.objectId,
                operation.targetState,
                nextIncarnation,
                operation.id,
                now
            )
            : this.database.prepare(
                `INSERT INTO s3_object_index
                    (logical_key, object_id, state, incarnation, operation_id, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(logical_key) DO UPDATE SET
                    object_id=excluded.object_id,
                    state=excluded.state,
                    incarnation=excluded.incarnation,
                    operation_id=excluded.operation_id,
                    updated_at=excluded.updated_at
                 WHERE s3_object_index.object_id=?
                   AND s3_object_index.state=?
                   AND s3_object_index.incarnation=?`
            ).bind(
                operation.logicalKey,
                operation.objectId,
                operation.targetState,
                nextIncarnation,
                operation.id,
                now,
                operation.previousObjectId,
                operation.previousState,
                operation.previousIncarnation
            );
        const statements = [
            this.database.prepare(
                `INSERT INTO s3_object_versions
                    (object_id, physical_key, byte_size, content_type, sha256, etag,
                     owner_token, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                operation.objectId,
                operation.physicalKey,
                object.size,
                object.contentType,
                object.sha256,
                object.etag,
                object.ownerToken,
                now
            ),
            indexStatement,
            this.database.prepare(
                `UPDATE s3_upload_operations SET state=?, updated_at=?
                 WHERE id=? AND state='uploading'`
            ).bind(operation.targetState, now, operation.id)
        ];
        if (operation.targetState === 'ready' && operation.previousOperationId &&
            operation.previousState && ['uploading', 'pending'].includes(operation.previousState)) {
            statements.push(this.database.prepare(
                `UPDATE s3_upload_operations SET state='deleted', updated_at=?
                 WHERE id=? AND state IN ('uploading', 'pending')`
            ).bind(now, operation.previousOperationId));
        }
        for (const object of supersededObjects) {
            statements.push(this.cleanupJob(object.objectId, object.physicalKey, now));
        }
        const results = await this.database.batch(statements);
        if (results[1]?.meta.changes === 1) {
            if (results[2]?.meta.changes === 1) return true;
            const current = await this.index(operation.logicalKey);
            if (current?.object_id === operation.objectId &&
                current.state === operation.targetState) {
                return true;
            }
        }
        await this.abortUpload(operation.id);
        return false;
    }

    async transition(operationId: string, next: S3UploadState): Promise<S3UploadState> {
        const current = await this.operation(operationId);
        if (!current) throw new Error('S3 upload operation not found');
        if (current.state === next) return next;
        if (!TRANSITIONS[current.state].has(next)) {
            throw new Error(`Illegal S3 upload transition: ${current.state} -> ${next}`);
        }
        const result = await this.database.prepare(
            `UPDATE s3_upload_operations SET state=?, updated_at=?
             WHERE id=? AND state=?`
        ).bind(next, Date.now(), operationId, current.state).run();
        if (result.meta.changes !== 1) throw new Error('Concurrent S3 upload transition');
        return next;
    }

    async abortUpload(operationId: string): Promise<void> {
        const current = await this.operation(operationId);
        if (!current || current.state === 'deleted') return;
        if (TRANSITIONS[current.state].has('deleted')) {
            await this.transition(operationId, 'deleted');
        }
    }

    async publish(logicalKey: string): Promise<string[]> {
        const current = await this.index(logicalKey);
        if (!current || current.state === 'deleted') throw new Error('S3 object not found');
        if (current.state === 'ready') return [];
        if (current.state !== 'pending' || !current.operation_id) {
            throw new Error(`S3 object cannot be published from ${current.state}`);
        }
        const operation = await this.operation(current.operation_id);
        if (!operation) throw new Error('S3 upload operation not found');
        const supersededObjectIds = await this.supersededObjectIds(operation);
        const supersededObjects = await Promise.all(supersededObjectIds.map(async (objectId) => ({
            objectId,
            physicalKey: await this.physicalKey(objectId)
        })));
        const now = Date.now();
        const statements = [
            this.database.prepare(
                `UPDATE s3_object_index SET state='ready', updated_at=?
                 WHERE logical_key=? AND object_id=? AND state='pending' AND operation_id=?`
            ).bind(now, logicalKey, current.object_id, current.operation_id),
            this.database.prepare(
                `UPDATE s3_upload_operations SET state='ready', updated_at=?
                 WHERE id=? AND state='pending'`
            ).bind(now, current.operation_id)
        ];
        if (operation.previous_operation_id && operation.previous_state &&
            ['uploading', 'pending'].includes(operation.previous_state)) {
            statements.push(this.database.prepare(
                `UPDATE s3_upload_operations SET state='deleted', updated_at=?
                 WHERE id=? AND state IN ('uploading', 'pending')`
            ).bind(now, operation.previous_operation_id));
        }
        for (const object of supersededObjects) {
            statements.push(this.cleanupJob(object.objectId, object.physicalKey, now));
        }
        const results = await this.database.batch(statements);
        if (results[0]?.meta.changes !== 1) {
            throw new Error('Concurrent S3 publication');
        }
        return supersededObjectIds;
    }

    async claimDelete(
        logicalKey: string,
        expected: { objectId?: string; ownerToken?: string } = {}
    ): Promise<string | null> {
        const current = await this.snapshot(logicalKey);
        if (!current || !['pending', 'ready'].includes(current.state)) return null;
        if (expected.objectId !== undefined && current.objectId !== expected.objectId) return null;
        if (expected.ownerToken !== undefined && current.ownerToken !== expected.ownerToken) return null;

        const operation = current.operationId ? await this.operation(current.operationId) : null;
        const now = Date.now();
        const restorePrevious = current.state === 'pending' && operation?.previous_object_id &&
            operation.previous_state && ['pending', 'ready'].includes(operation.previous_state);
        const indexStatement = restorePrevious
            ? this.database.prepare(
                `UPDATE s3_object_index
                 SET object_id=?, state=?, incarnation=?, operation_id=?, updated_at=?
                 WHERE logical_key=? AND object_id=? AND state=? AND incarnation=?`
            ).bind(
                operation.previous_object_id,
                operation.previous_state,
                operation.previous_incarnation,
                operation.previous_operation_id,
                now,
                logicalKey,
                current.objectId,
                current.state,
                current.incarnation
            )
            : this.database.prepare(
                `UPDATE s3_object_index SET state='deleted', operation_id=NULL, updated_at=?
                 WHERE logical_key=? AND object_id=? AND state=? AND incarnation=?`
            ).bind(now, logicalKey, current.objectId, current.state, current.incarnation);
        const statements = [indexStatement];
        if (current.operationId) {
            statements.push(this.database.prepare(
                `UPDATE s3_upload_operations SET state='deleted', updated_at=?
                 WHERE id=? AND state IN ('uploading', 'pending', 'ready')`
            ).bind(now, current.operationId));
        }
        statements.push(this.cleanupJob(current.objectId, current.physicalKey, now));
        const results = await this.database.batch(statements);
        return results[0]?.meta.changes === 1 ? current.objectId : null;
    }

    async staleOperations(limit: number, staleBefore: number): Promise<S3StaleUpload[]> {
        return (await this.database.prepare(
            `SELECT * FROM s3_upload_operations
             WHERE state IN ('uploading', 'pending') AND updated_at <= ?
             ORDER BY updated_at, id LIMIT ?`
        ).bind(staleBefore, limit).all<S3StaleUpload>()).results;
    }

    async claimStale(operation: S3StaleUpload): Promise<string | null> {
        if (operation.state === 'pending') {
            return this.claimDelete(operation.logical_key, { objectId: operation.object_id });
        }
        const now = Date.now();
        const results = await this.database.batch([
            this.database.prepare(
                `UPDATE s3_upload_operations SET state='deleted', updated_at=?
                 WHERE id=? AND state='uploading'`
            ).bind(now, operation.id),
            this.cleanupJob(operation.object_id, operation.physical_key, now)
        ]);
        return results[0]?.meta.changes === 1 ? operation.object_id : null;
    }

    async currentObjectId(logicalKey: string): Promise<string | null> {
        const current = await this.index(logicalKey);
        return current && ['pending', 'ready'].includes(current.state) ? current.object_id : null;
    }

    async isObjectReferenced(objectId: string): Promise<boolean> {
        const row = await this.database.prepare(
            `SELECT 1 AS present FROM s3_object_index
             WHERE object_id=? AND state IN ('pending', 'ready')
             UNION ALL
             SELECT 1 AS present FROM s3_upload_operations
             WHERE state IN ('uploading', 'pending')
               AND (object_id=? OR previous_object_id=?)
             LIMIT 1`
        ).bind(objectId, objectId, objectId).first<{ present: number }>();
        return Boolean(row);
    }

    async removeVersionIfUnreferenced(objectId: string): Promise<boolean> {
        if (await this.isObjectReferenced(objectId)) return false;
        await this.database.prepare(
            'DELETE FROM s3_object_versions WHERE object_id=?'
        ).bind(objectId).run();
        return true;
    }
}
