import type {
    CreateWikiEntryDocumentMediaInput,
    SaveWikiEntryDocumentInput,
    WikiDocumentRepository,
    WikiEntryContent,
    WikiEntryDocumentMediaRecord,
    WikiEntryDocumentRecord,
    WikiEntryDocumentRevisionRecord,
    WikiEntryDocumentRevisionSnapshot,
    WikiEntryDocumentRevisionsSummary,
    WikiEntryDocumentSaveResult,
    WikiEntryDocumentTarget,
} from '@/ports/repositories';
import type {
    WikiContentMode,
    WikiPublicStoryDocument,
} from '@imsweb/contracts/wiki';
import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

const EMPTY_DOCUMENT: WikiPublicStoryDocument = {
    version: 1,
    headings: [],
    availableTags: [],
    blocks: [],
};

/** Snapshots kept per entry; older ones are pruned inside the save transaction. */
const WIKI_DOCUMENT_REVISION_LIMIT = 30;

interface DocumentRevisionRow {
    revision: number;
    summary: string;
    created_by: string | null;
    created_at: string | Date;
}

/** The driver returns `Date` for `timestamptz`; the wire contract is ISO. */
function isoTime(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
}

function asRevision(
    row: DocumentRevisionRow
): WikiEntryDocumentRevisionRecord {
    return {
        revision: row.revision,
        summary: row.summary,
        createdBy: row.created_by,
        createdAt: isoTime(row.created_at),
    };
}

function asDocument(value: unknown): WikiPublicStoryDocument {
    if (!value || typeof value !== 'object') return EMPTY_DOCUMENT;
    const document = value as Partial<WikiPublicStoryDocument>;
    if (document.version !== 1) return EMPTY_DOCUMENT;
    return {
        version: 1,
        headings: document.headings ?? [],
        availableTags: document.availableTags ?? [],
        blocks: document.blocks ?? [],
    };
}

const MEDIA_COLUMNS = `id, entry_id AS "entryId", project_id AS "projectId",
                       object_key AS "objectKey", alt_text AS "altText"`;

/** SQL adapter for the Enhanced Markdown document side of a Wiki entry. */
export class SqlWikiDocumentRepository implements WikiDocumentRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async findWikiEntryDocumentTarget(
        entryId: number
    ): Promise<WikiEntryDocumentTarget | null> {
        return queryOne<WikiEntryDocumentTarget>(
            this.database,
            `SELECT entries.id AS "entryId",
                    entries.project_id AS "projectId",
                    projects.code AS "projectCode",
                    projects.name_cn AS "projectName",
                    entries.local_name_cn AS "name",
                    entries.storage_slug AS "folderName",
                    entries.entry_kind AS "entryKind",
                    entries.content_mode AS "contentMode"
               FROM wiki_entries entries
               JOIN projects projects ON projects.id=entries.project_id
              WHERE entries.id=? AND entries.deleted_at IS NULL`,
            [entryId]
        );
    }

    async findWikiEntryDocument(
        entryId: number
    ): Promise<WikiEntryDocumentRecord | null> {
        const row = await queryOne<{
            entry_id: number;
            revision: number;
            source_markdown: string;
            compiled_ast: unknown;
            plain_text: string;
        }>(
            this.database,
            `SELECT entry_id, revision, source_markdown, compiled_ast, plain_text
               FROM wiki_entry_documents WHERE entry_id=?`,
            [entryId]
        );
        if (!row) return null;
        return {
            entryId: row.entry_id,
            revision: row.revision,
            sourceMarkdown: row.source_markdown,
            document: asDocument(row.compiled_ast),
            plainText: row.plain_text,
        };
    }

    findWikiEntryContent(entryId: number): Promise<WikiEntryContent> {
        return queryOne<{
            content_mode: WikiContentMode;
            compiled_ast: unknown;
        }>(
            this.database,
            `SELECT entries.content_mode, documents.compiled_ast
               FROM wiki_entries entries
               LEFT JOIN wiki_entry_documents documents
                      ON documents.entry_id=entries.id
              WHERE entries.id=?`,
            [entryId]
        ).then((row) => ({
            contentMode: row?.content_mode ?? 'structured',
            document: row?.compiled_ast ? asDocument(row.compiled_ast) : null,
        }));
    }

    saveWikiEntryDocument(
        input: SaveWikiEntryDocumentInput
    ): Promise<WikiEntryDocumentSaveResult> {
        return this.database.transaction(async (database) => {
            const entry = await queryOne<{ id: number }>(
                database,
                `SELECT id FROM wiki_entries
                  WHERE id=? AND deleted_at IS NULL FOR UPDATE`,
                [input.entryId]
            );
            if (!entry) return { status: 'not-found' } as const;
            const current = await queryOne<{ revision: number }>(
                database,
                'SELECT revision FROM wiki_entry_documents WHERE entry_id=?',
                [input.entryId]
            );
            const currentRevision = current?.revision ?? 0;
            if (currentRevision !== input.expectedRevision) {
                return { status: 'conflict', revision: currentRevision } as const;
            }
            const revision = currentRevision + 1;
            await executeSql(
                database,
                `INSERT INTO wiki_entry_documents
                     (entry_id, project_id, source_markdown, compiled_ast,
                      plain_text, revision, updated_by, updated_at)
                 VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT (entry_id) DO UPDATE
                    SET source_markdown=EXCLUDED.source_markdown,
                        compiled_ast=EXCLUDED.compiled_ast,
                        plain_text=EXCLUDED.plain_text,
                        revision=EXCLUDED.revision,
                        updated_by=EXCLUDED.updated_by,
                        updated_at=CURRENT_TIMESTAMP`,
                [
                    input.entryId,
                    input.projectId,
                    input.sourceMarkdown,
                    JSON.stringify(input.document),
                    input.plainText,
                    revision,
                    input.updatedBy,
                ]
            );
            await this.reconcileCoverReferences(database, input);
            await executeSql(
                database,
                'UPDATE wiki_entries SET content_mode=? WHERE id=?',
                [input.contentMode, input.entryId]
            );
            await executeSql(
                database,
                `INSERT INTO wiki_entry_document_revisions
                     (entry_id, revision, source_markdown, summary, created_by)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    input.entryId,
                    revision,
                    input.sourceMarkdown,
                    input.summary,
                    input.updatedBy,
                ]
            );
            await executeSql(
                database,
                `DELETE FROM wiki_entry_document_revisions
                  WHERE entry_id=? AND revision<=?`,
                [input.entryId, revision - WIKI_DOCUMENT_REVISION_LIMIT]
            );
            return { status: 'saved', revision } as const;
        });
    }

    /**
     * Rewrites the document's shared cover references to exactly the saved set.
     *
     * Runs inside the save transaction: a stale reference would keep a deleted
     * asset alive, and a missing one would let the asset be deleted while a
     * document still embeds it.
     */
    private async reconcileCoverReferences(
        database: SqlDatabase,
        input: SaveWikiEntryDocumentInput
    ): Promise<void> {
        await executeSql(
            database,
            'DELETE FROM wiki_entry_document_cover_refs WHERE entry_id=?',
            [input.entryId]
        );
        for (const coverAssetId of new Set(input.coverAssetIds)) {
            await executeSql(
                database,
                `INSERT INTO wiki_entry_document_cover_refs
                     (entry_id, project_id, cover_asset_id)
                 VALUES (?, ?, ?)
                 ON CONFLICT (entry_id, cover_asset_id) DO NOTHING`,
                [input.entryId, input.projectId, coverAssetId]
            );
        }
    }

    listWikiEntryDocumentMedia(
        entryId: number
    ): Promise<WikiEntryDocumentMediaRecord[]> {
        return queryAll<WikiEntryDocumentMediaRecord>(
            this.database,
            `SELECT ${MEDIA_COLUMNS} FROM wiki_entry_document_media
              WHERE entry_id=? ORDER BY id`,
            [entryId]
        );
    }

    /**
     * The retention window, newest first.
     *
     * `ORDER BY revision DESC` (not `created_at`) keeps the order deterministic
     * even when two saves commit inside the same clock tick, and the `LIMIT`
     * repeats the pruned window so a row outside it can never be listed. The
     * entry join hides soft-deleted entries exactly like the document read.
     */
    async listWikiEntryDocumentRevisions(
        entryId: number
    ): Promise<WikiEntryDocumentRevisionRecord[]> {
        const rows = await queryAll<DocumentRevisionRow>(
            this.database,
            `SELECT revisions.revision, revisions.summary,
                    revisions.created_by, revisions.created_at
               FROM wiki_entry_document_revisions revisions
               JOIN wiki_entries entries ON entries.id=revisions.entry_id
              WHERE revisions.entry_id=? AND entries.deleted_at IS NULL
              ORDER BY revisions.revision DESC
              LIMIT ${WIKI_DOCUMENT_REVISION_LIMIT}`,
            [entryId]
        );
        return rows.map(asRevision);
    }

    /**
     * One snapshot scoped to its entry.
     *
     * A revision that belongs to another entry, or to a soft-deleted entry,
     * resolves to `null` so the route cannot report another entry's existence.
     */
    async findWikiEntryDocumentRevision(
        entryId: number,
        revision: number
    ): Promise<WikiEntryDocumentRevisionSnapshot | null> {
        const row = await queryOne<
            DocumentRevisionRow & { source_markdown: string }
        >(
            this.database,
            `SELECT revisions.revision, revisions.summary,
                    revisions.created_by, revisions.created_at,
                    revisions.source_markdown
               FROM wiki_entry_document_revisions revisions
               JOIN wiki_entries entries ON entries.id=revisions.entry_id
              WHERE revisions.entry_id=? AND revisions.revision=?
                AND entries.deleted_at IS NULL`,
            [entryId, revision]
        );
        return row
            ? { ...asRevision(row), sourceMarkdown: row.source_markdown }
            : null;
    }

    /**
     * Counters for the workbench's history entry, in the same scope as the list.
     *
     * The join repeats the list/detail visibility rule, so a soft-deleted entry
     * reports an empty history here too instead of disagreeing with the routes.
     */
    async findWikiEntryDocumentRevisionsSummary(
        entryId: number
    ): Promise<WikiEntryDocumentRevisionsSummary> {
        const row = await queryOne<{
            count: number | string;
            latest_revision: number | null;
        }>(
            this.database,
            `SELECT COUNT(*)::int AS count, MAX(revisions.revision) AS latest_revision
               FROM wiki_entry_document_revisions revisions
               JOIN wiki_entries entries ON entries.id=revisions.entry_id
              WHERE revisions.entry_id=? AND entries.deleted_at IS NULL`,
            [entryId]
        );
        return {
            count: Number(row?.count ?? 0),
            latestRevision: row?.latest_revision ?? null,
        };
    }

    findWikiEntryDocumentMediaById(
        id: number
    ): Promise<WikiEntryDocumentMediaRecord | null> {
        return queryOne<WikiEntryDocumentMediaRecord>(
            this.database,
            `SELECT ${MEDIA_COLUMNS} FROM wiki_entry_document_media WHERE id=?`,
            [id]
        );
    }

    async createWikiEntryDocumentMedia(
        input: CreateWikiEntryDocumentMediaInput
    ): Promise<WikiEntryDocumentMediaRecord> {
        const record = await queryOne<WikiEntryDocumentMediaRecord>(
            this.database,
            `INSERT INTO wiki_entry_document_media
                 (project_id, entry_id, object_key, alt_text)
             VALUES (?, ?, ?, ?) RETURNING ${MEDIA_COLUMNS}`,
            [input.projectId, input.entryId, input.objectKey, input.altText]
        );
        if (!record)
            throw new Error('Wiki entry document media was not created');
        return record;
    }
}
