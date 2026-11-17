import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy,
} from '@/infra/db/sql/database';

// Must name the newest migration whose columns production code already reads.
// Catalog/profile maintenance requires the canonical catalog and Wiki bindings.
// Fail at startup if deployment has not yet applied the additive migration.
export const REQUIRED_POSTGRESQL_SCHEMA_VERSION =
    '20261105190000_character_profile_authority';
// Parallel branches can introduce an earlier timestamp after the newest catalog
// migration has already run. Checking only that newest row would miss this gap.
const REQUIRED_POSTGRESQL_SCHEMA_VERSIONS = [
    REQUIRED_POSTGRESQL_SCHEMA_VERSION,
    '20261105120000_platform_profile_slug_not_numeric',
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
