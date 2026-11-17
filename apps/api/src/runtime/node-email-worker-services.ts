import type { NodeDatabaseConfig } from '@/config/database';
import { parseNodeDatabaseConfig } from '@/config/database';
import { parsePlatformJwtSecret } from '@/config/platform-jwt-secret';
import { PostgresConnection } from '@/infra/db/postgresql/connection';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlPlatformEmailConfigurationRepository } from '@/infra/db/repositories/platform-email-configuration-repository';
import { SqlPlatformEmailDeliveryRepository } from '@/infra/db/repositories/platform-email-delivery-repository';
import { PlatformEmailJobPayloadCipherAdapter } from '@/infra/email/smtp/platform-email-job-payload';
import { ConfiguredPlatformEmailService } from '@/infra/email/smtp/platform-email-service';
import { PlatformEmailSecretCipher } from '@/infra/email/smtp/platform-email-secrets';
import { NodeEmailDeliveryRunner } from '@/runtime/node-email-delivery-runner';

export interface NodeEmailWorkerServices {
    runner: NodeEmailDeliveryRunner;
    close(deadlineAt?: number): Promise<void>;
}

export interface NodeEmailWorkerServiceOptions {
    databaseConfig?: NodeDatabaseConfig;
}

export async function createNodeEmailWorkerServices(
    environment: NodeJS.ProcessEnv = process.env,
    options: NodeEmailWorkerServiceOptions = {},
): Promise<NodeEmailWorkerServices> {
    const database = PostgresConnection.create(
        options.databaseConfig ?? parseNodeDatabaseConfig(environment),
    );
    try {
        await new PostgresqlSchemaStrategy().initializePlatform(database);
        const secret = parsePlatformJwtSecret(environment);
        const configuration = new SqlPlatformEmailConfigurationRepository(database);
        const delivery = new SqlPlatformEmailDeliveryRepository(database);
        const sender = new ConfiguredPlatformEmailService(
            configuration,
            new PlatformEmailSecretCipher(secret),
        );
        const runner = new NodeEmailDeliveryRunner(
            delivery,
            new PlatformEmailJobPayloadCipherAdapter(secret),
            sender,
        );
        let closing: Promise<void> | undefined;
        return {
            runner,
            close(deadlineAt?: number): Promise<void> {
                closing ??= runner.close(deadlineAt).then(async () => {
                    const closingDatabase = Promise.resolve().then(() => database.close());
                    if (deadlineAt === undefined) {
                        await closingDatabase;
                        return;
                    }
                    const remaining = deadlineAt - Date.now();
                    if (remaining <= 0) {
                        void closingDatabase.catch(() => undefined);
                        return;
                    }
                    let timer: NodeJS.Timeout | undefined;
                    await Promise.race([
                        closingDatabase,
                        new Promise<void>((resolve) => {
                            timer = setTimeout(resolve, remaining);
                            timer.unref();
                        }),
                    ]).finally(() => {
                        if (timer) clearTimeout(timer);
                    });
                });
                return closing;
            },
        };
    } catch (error) {
        await database.close().catch(() => undefined);
        throw error;
    }
}
