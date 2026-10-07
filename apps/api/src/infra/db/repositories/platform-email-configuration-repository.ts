import type {
    PlatformEmailConfigurationRecord,
    PlatformEmailConfigurationStore,
} from '@/ports/email';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { sqlStatement } from '@/infra/db/sql/query';

interface PlatformEmailConfigurationRow {
    enabled: boolean | number | string;
    host: string;
    port: number;
    security: PlatformEmailConfigurationRecord['security'];
    username_ciphertext: string | null;
    password_ciphertext: string | null;
    from_address: string;
    from_name: string;
    resend_cooldown_seconds: number;
    updated_at: number;
}

function configurationRecord(
    row: PlatformEmailConfigurationRow,
): PlatformEmailConfigurationRecord {
    return {
        enabled: row.enabled === true || row.enabled === 1 || row.enabled === 't',
        host: row.host,
        port: row.port,
        security: row.security,
        usernameCiphertext: row.username_ciphertext,
        passwordCiphertext: row.password_ciphertext,
        fromAddress: row.from_address,
        fromName: row.from_name,
        resendCooldownSeconds: row.resend_cooldown_seconds,
        updatedAt: row.updated_at,
    };
}

export class SqlPlatformEmailConfigurationRepository
    implements PlatformEmailConfigurationStore
{
    constructor(private readonly database: ManagedSqlDatabase) {}

    async getPlatformEmailConfiguration(): Promise<PlatformEmailConfigurationRecord> {
        const result = await sqlStatement(
            this.database,
            `SELECT enabled, host, port, security, username_ciphertext,
                    password_ciphertext, from_address, from_name,
                    resend_cooldown_seconds, updated_at
             FROM platform_email_configuration
             WHERE singleton_id=1`,
            [],
        ).all<PlatformEmailConfigurationRow>();
        const row = result.results[0];
        if (!row) throw new Error('Platform email configuration is missing');
        return configurationRecord(row);
    }

    async updatePlatformEmailConfiguration(
        input: PlatformEmailConfigurationRecord & { expectedUpdatedAt: number },
    ): Promise<
        | { status: 'saved'; configuration: PlatformEmailConfigurationRecord }
        | { status: 'conflict'; configuration: PlatformEmailConfigurationRecord }
    > {
        const result = await sqlStatement(
            this.database,
            `UPDATE platform_email_configuration
             SET enabled=?, host=?, port=?, security=?, username_ciphertext=?,
                 password_ciphertext=?, from_address=?, from_name=?,
                 resend_cooldown_seconds=?, updated_at=?
             WHERE singleton_id=1 AND updated_at=?
             RETURNING enabled, host, port, security, username_ciphertext,
                       password_ciphertext, from_address, from_name,
                       resend_cooldown_seconds, updated_at`,
            [
                input.enabled,
                input.host,
                input.port,
                input.security,
                input.usernameCiphertext,
                input.passwordCiphertext,
                input.fromAddress,
                input.fromName,
                input.resendCooldownSeconds,
                input.updatedAt,
                input.expectedUpdatedAt,
            ],
        ).all<PlatformEmailConfigurationRow>();
        const saved = result.results[0];
        if (saved) {
            return { status: 'saved', configuration: configurationRecord(saved) };
        }
        return {
            status: 'conflict',
            configuration: await this.getPlatformEmailConfiguration(),
        };
    }
}
