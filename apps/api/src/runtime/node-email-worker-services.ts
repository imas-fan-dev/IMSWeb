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
import { NodeValkeyMailRunner } from '@/runtime/node-valkey-mail-runner';
import { openValkeyMailQueue, requireMailQueueUrl, type ValkeyMailQueue } from '@/infra/cache/valkey/mail-queue';
import { SqlStationMessageRepository } from '@/infra/db/repositories/station-message-repository';

export interface NodeEmailWorkerServices {
    runner: Pick<NodeEmailDeliveryRunner, 'start' | 'isReady' | 'isLive' | 'close'>;
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
    let queue: ValkeyMailQueue | undefined;
    try {
        await new PostgresqlSchemaStrategy().initializePlatform(database);
        const secret = parsePlatformJwtSecret(environment);
        const configuration = new SqlPlatformEmailConfigurationRepository(database);
        const delivery = new SqlPlatformEmailDeliveryRepository(database);
        const sender = new ConfiguredPlatformEmailService(
            configuration,
            new PlatformEmailSecretCipher(secret),
        );
        const mailQueue = queue = await openValkeyMailQueue(requireMailQueueUrl(environment));
        const cipher = new PlatformEmailJobPayloadCipherAdapter(secret);
        // Drain OTP jobs written before cutover. New producers never insert SQL jobs.
        const legacy = new NodeEmailDeliveryRunner(delivery, cipher, sender);
        const current = new NodeValkeyMailRunner(mailQueue, delivery, new SqlStationMessageRepository(database), cipher, sender);
        const runner: NodeEmailWorkerServices['runner'] = {
            start() { current.start(); legacy.start(); },
            isReady() { return current.isReady() && legacy.isReady(); },
            isLive() { return current.isLive() && legacy.isLive(); },
            async close(deadlineAt) { await Promise.all([current.close(deadlineAt), legacy.close(deadlineAt)]); },
        };
        let closing: Promise<void> | undefined;
        return {
            runner,
            close(deadlineAt?: number): Promise<void> {
                closing ??= runner.close(deadlineAt).then(async () => {
                    mailQueue.close();
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
        queue?.close();
        await database.close().catch(() => undefined);
        throw error;
    }
}
