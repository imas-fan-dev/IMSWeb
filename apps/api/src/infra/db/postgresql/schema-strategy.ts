import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy,
} from '@/infra/db/sql/database';

// Must name the newest migration whose columns production code already reads.
// Catalog/profile maintenance requires the canonical catalog and Wiki bindings.
// Wiki document mode writes/reads `content_mode`, `wiki_entry_documents`, and
// `wiki_entry_document_revisions`, and document media/cover references need
// `wiki_entry_document_media` / `wiki_entry_document_cover_refs`; skipping an
// additive migration would break public story reads, document saves, or media
// uploads.
// Fail at startup if deployment has not yet applied the additive migration.
export const REQUIRED_POSTGRESQL_SCHEMA_VERSION =
    '20261122140000_wiki_entry_document_media';
// Parallel branches can introduce an earlier timestamp after the newest catalog
// migration has already run. Checking only that newest row would miss this gap.
const REQUIRED_POSTGRESQL_SCHEMA_VERSIONS = [
    REQUIRED_POSTGRESQL_SCHEMA_VERSION,
    // Document mode read/write paths depend on both Wiki additive migrations:
    // media and cover references would silently break with only the newer one.
    '20261122120000_wiki_entry_documents',
    '20261121120000_namecard_project_visibility',
    '20261105190000_character_profile_authority',
    '20261105120000_platform_profile_slug_not_numeric',
    // Tags write/read columns the wall and card editor rely on; a deployment
    // that skipped the additive migration would fail on first use.
    '20261120120000_namecard_tags',
] as const;

export class PostgresqlSchemaStrategy implements SqlSchemaStrategy {
    private readonly verifications = new WeakMap<
        ManagedSqlDatabase,
        Promise<void>
    >();

    private verify(database: ManagedSqlDatabase): Promise<void> {
        const existing = this.verifications.get(database);
        if (existing) return existing;
        const verification = this.verifyCurrent(database);
        this.verifications.set(database, verification);
        return verification;
    }

    private async verifyCurrent(database: ManagedSqlDatabase): Promise<void> {
        for (const version of REQUIRED_POSTGRESQL_SCHEMA_VERSIONS) {
            let migration: { version: string } | null;
            try {
                migration = await database
                    .prepare(
                        'SELECT version FROM ims_schema_migrations WHERE version=?',
                    )
                    .bind(version)
                    .first<{ version: string }>();
            } catch (error) {
                throw new Error(
                    'PostgreSQL schema is not initialized; run pnpm run migration:postgresql',
                    { cause: error },
                );
            }
            if (!migration) {
                throw new Error(
                    `PostgreSQL schema migration ${version} is required; ` +
                        'run pnpm run migration:postgresql',
                );
            }
        }
    }

    initializeCore(database: ManagedSqlDatabase): Promise<void> {
        return this.verify(database);
    }

    initializePlatform(database: ManagedSqlDatabase): Promise<void> {
        return this.verify(database);
    }

    initializeFudaba(database: ManagedSqlDatabase): Promise<void> {
        return this.verify(database);
    }

    initializeStory(database: ManagedSqlDatabase): Promise<void> {
        return this.verify(database);
    }
}
