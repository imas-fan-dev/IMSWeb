/**
 * The station-message repository is the only place that writes the batch ledger
 * and the per-recipient snapshot, so its SQL has to be exercised against a real
 * database: the handler tests replace it with a stub and would happily accept a
 * broken query.
 */
import { createPostgresTestDatabase, postgresTest } from '../postgres-test-database';
import { SqlStationMessageRepository } from '@/infra/db/repositories/station-message-repository';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import { NodeStationMessageRunner } from '@/runtime/node-station-message-runner';
import type { PlatformEmailMessage } from '@/ports/email';
import type {
    StationMessageEmailResult,
    StationMessageEmailTarget,
    StationMessageRecord,
    StationMessageRepository
} from '@/ports/repositories/station-messages';
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';

const CREATED_AT = 1_790_000_000_000;

function accountSql(id: string, status = 'active'): [string, unknown[]] {
    return [
        `INSERT INTO platform_accounts (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, ?, 0, ?, ?, NULL)`,
        [id, status, CREATED_AT, CREATED_AT]
    ];
}

function profileSql(accountId: string, displayName: string): [string, unknown[]] {
    return [
        `INSERT INTO platform_profiles (account_id, display_name, updated_at)
         VALUES (?, ?, ?)`,
        [accountId, displayName, CREATED_AT]
    ];
}

function credentialSql(accountId: string, email: string): [string, unknown[]] {
    return [
        `INSERT INTO platform_email_credentials
             (normalized_email, account_id, algorithm, parameters_json, salt, password_hash,
              created_at, updated_at)
         VALUES (?, ?, 'bcrypt', '{}', NULL, '$2b$04$hash', ?, ?)`,
        [email, accountId, CREATED_AT, CREATED_AT]
    ];
}

async function seedAccount(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    id: string,
    displayName: string,
    email: string | null,
    status = 'active'
): Promise<void> {
    const [accountStatement, accountParams] = accountSql(id, status);
    await executeSql(database, accountStatement, accountParams);
    const [profileStatement, profileParams] = profileSql(id, displayName);
    await executeSql(database, profileStatement, profileParams);
    if (email) {
        const [credentialStatement, credentialParams] = credentialSql(id, email);
        await executeSql(database, credentialStatement, credentialParams);
    }
}

function notificationCountSql(accountId: string): [string, unknown[]] {
    return [
        `SELECT COUNT(*)::int AS total FROM namecard_notifications
         WHERE recipient_account_id=? AND kind='station-message'`,
        [accountId]
    ];
}

describe('station message repository', () => {
    postgresTest('delivers an immediate batch to the selected accounts', async () => {
        const database = await createPostgresTestDatabase('station-messages-immediate');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '调试用户 A', 'a@example.com');
        await seedAccount(database, 'acct-b', '调试用户 B', null);
        await seedAccount(database, 'acct-c', '停用用户', 'c@example.com', 'suspended');

        const message = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '维护通知',
            body: '今晚 23:00 停机维护。',
            audience: 'selected',
            accountIds: ['acct-a', 'acct-b'],
            forwardEmail: true,
            scheduledAt: null
        });

        assert.equal(message.status, 'sent');
        assert.equal(message.recipientCount, 2);
        assert.equal(message.deliveredCount, 2);
        assert.ok(message.startedAt);
        assert.ok(message.completedAt);

        const deliveredA = await queryOne<{ total: number }>(
            database,
            ...notificationCountSql('acct-a')
        );
        assert.equal(deliveredA?.total, 1);
        const deliveredC = await queryOne<{ total: number }>(
            database,
            ...notificationCountSql('acct-c')
        );
        assert.equal(deliveredC?.total, 0);

        const deliveries = await repository.listDeliveries(message.id);
        assert.deepEqual(
            deliveries.map((entry) => ({
                accountId: entry.accountId,
                displayName: entry.displayName,
                email: entry.email,
                delivered: entry.delivered,
                emailState: entry.emailState
            })),
            [
                {
                    accountId: 'acct-a',
                    displayName: '调试用户 A',
                    email: 'a@example.com',
                    delivered: true,
                    emailState: 'pending'
                },
                {
                    accountId: 'acct-b',
                    displayName: '调试用户 B',
                    email: null,
                    delivered: true,
                    emailState: 'skipped'
                }
            ]
        );
    });

    postgresTest('snapshots every active account for an all-audience batch', async () => {
        const database = await createPostgresTestDatabase('station-messages-all');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '甲', 'a@example.com');
        await seedAccount(database, 'acct-b', '乙', 'b@example.com');
        await seedAccount(database, 'acct-off', '离职', 'off@example.com', 'suspended');

        const message = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '全员通知',
            body: '全员可见。',
            audience: 'all',
            accountIds: ['acct-off'],
            forwardEmail: false,
            scheduledAt: null
        });

        assert.equal(message.status, 'sent');
        assert.equal(message.recipientCount, 2);
        assert.equal(message.deliveredCount, 2);
        assert.equal(message.forwardEmail, false);
        assert.deepEqual(
            (await repository.listDeliveries(message.id)).map((entry) => entry.emailState),
            ['skipped', 'skipped']
        );
    });

    postgresTest('keeps a scheduled batch until it is due, then dispatches it', async () => {
        const database = await createPostgresTestDatabase('station-messages-scheduled');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '甲', 'a@example.com');

        const scheduled = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '定时通知',
            body: '稍后送达。',
            audience: 'selected',
            accountIds: ['acct-a'],
            forwardEmail: false,
            scheduledAt: Date.now() + 60_000
        });
        assert.equal(scheduled.status, 'scheduled');
        assert.equal(scheduled.deliveredCount, 0);
        const beforeDue = await queryOne<{ total: number }>(
            database,
            ...notificationCountSql('acct-a')
        );
        assert.equal(beforeDue?.total, 0);

        await executeSql(
            database,
            'UPDATE station_messages SET scheduled_at = CURRENT_TIMESTAMP - INTERVAL \'1 minute\' WHERE id=?',
            [scheduled.id]
        );
        const dispatched = await repository.dispatchDue();
        assert.equal(dispatched?.id, scheduled.id);
        assert.equal(dispatched?.status, 'sent');
        assert.equal(dispatched?.deliveredCount, 1);
        assert.equal(await repository.dispatchDue(), null);

        const afterDue = await queryOne<{ total: number }>(
            database,
            ...notificationCountSql('acct-a')
        );
        assert.equal(afterDue?.total, 1);
    });

    postgresTest('cancels only a pending schedule', async () => {
        const database = await createPostgresTestDatabase('station-messages-cancel');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '甲', 'a@example.com');

        const scheduled = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '待取消',
            body: '取消我。',
            audience: 'selected',
            accountIds: ['acct-a'],
            forwardEmail: false,
            scheduledAt: Date.now() + 60_000
        });

        const canceled = await repository.cancel(scheduled.id);
        assert.equal(canceled?.status, 'canceled');
        assert.ok(canceled?.completedAt);
        assert.equal(await repository.cancel(scheduled.id), null);
        assert.equal(await repository.cancel('00000000-0000-0000-0000-000000000000'), null);
    });

    postgresTest('lists and searches the batch ledger and the recipient pool', async () => {
        const database = await createPostgresTestDatabase('station-messages-list');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '调试用户 A', 'alpha@example.com');
        await seedAccount(database, 'acct-b', '第二个人', 'beta@example.com');

        const first = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '第一条',
            body: '正文一。',
            audience: 'selected',
            accountIds: ['acct-a'],
            forwardEmail: false,
            scheduledAt: null
        });
        const second = await repository.create({
            senderAdminId: '2',
            senderAdminName: '另一个管理员',
            title: '第二条',
            body: '正文二。',
            audience: 'selected',
            accountIds: ['acct-b'],
            forwardEmail: false,
            scheduledAt: null
        });

        const listed = await repository.list({ limit: 10, offset: 0 });
        assert.equal(listed.total, 2);
        assert.equal(listed.messages.length, 2);
        assert.equal((await repository.findById(first.id))?.title, '第一条');

        const byDisplayName = await repository.listTargets({
            query: '第二',
            limit: 10,
            offset: 0
        });
        assert.equal(byDisplayName.total, 1);
        assert.equal(byDisplayName.targets[0].accountId, 'acct-b');
        assert.equal(byDisplayName.targets[0].displayName, '第二个人');
        assert.equal(byDisplayName.targets[0].email, 'beta@example.com');

        const byEmail = await repository.listTargets({
            query: 'alpha@',
            limit: 10,
            offset: 0
        });
        assert.deepEqual(byEmail.targets.map((target) => target.accountId), ['acct-a']);

        const everything = await repository.listTargets({ limit: 1, offset: 0 });
        assert.equal(everything.total, 2);
        assert.equal(everything.targets.length, 1);
        assert.equal(second.senderAdminName, '另一个管理员');
    });

    postgresTest('retries a transient email failure and settles the batch', async () => {
        const database = await createPostgresTestDatabase('station-messages-email');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '甲', 'a@example.com');

        const message = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '邮件转发',
            body: '正文。',
            audience: 'selected',
            accountIds: ['acct-a'],
            forwardEmail: true,
            scheduledAt: null
        });

        assert.deepEqual(await repository.listPendingEmailMessages(10), [message.id]);

        const targets = await repository.claimEmailTargets(message.id, 10);
        assert.deepEqual(
            targets.map((target) => ({ accountId: target.accountId, email: target.email, attempts: target.attempts })),
            [{ accountId: 'acct-a', email: 'a@example.com', attempts: 1 }]
        );
        await repository.markEmailResult(message.id, 'acct-a', {
            state: 'failed',
            error: 'smtp timeout',
            retryable: true
        });
        assert.deepEqual(
            (await repository.listDeliveries(message.id)).map((entry) => entry.emailState),
            ['pending']
        );

        for (let attempt = 0; attempt < 2; attempt += 1) {
            await repository.claimEmailTargets(message.id, 10);
            await repository.markEmailResult(message.id, 'acct-a', {
                state: 'failed',
                error: 'smtp timeout',
                retryable: true
            });
        }
        await repository.completeEmailForwarding(message.id);
        const settled = await repository.findById(message.id);
        assert.equal(settled?.emailFailedCount, 1);
        assert.equal(settled?.emailSentCount, 0);
        assert.deepEqual(
            (await repository.listDeliveries(message.id)).map((entry) => entry.emailState),
            ['failed']
        );
        assert.deepEqual(await repository.listPendingEmailMessages(10), []);
    });

    postgresTest('records a delivered email once', async () => {
        const database = await createPostgresTestDatabase('station-messages-email-sent');
        const repository = new SqlStationMessageRepository(database);
        await seedAccount(database, 'acct-a', '甲', 'a@example.com');

        const message = await repository.create({
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '邮件成功',
            body: '正文。',
            audience: 'selected',
            accountIds: ['acct-a'],
            forwardEmail: true,
            scheduledAt: null
        });
        await repository.claimEmailTargets(message.id, 10);
        await repository.markEmailResult(message.id, 'acct-a', {
            state: 'sent',
            error: null,
            retryable: false
        });
        await repository.completeEmailForwarding(message.id);

        const settled = await repository.findById(message.id);
        assert.equal(settled?.emailSentCount, 1);
        assert.equal(settled?.emailFailedCount, 0);
        const [delivery] = await repository.listDeliveries(message.id);
        assert.equal(delivery.emailState, 'sent');
        assert.deepEqual(await repository.listPendingEmailMessages(10), []);
    });
});

describe('station message runner', () => {
    function stubRepository(overrides: Partial<StationMessageRepository>): StationMessageRepository {
        const unused = async () => {
            throw new Error('unexpected call');
        };
        return {
            create: unused,
            findById: async () => null,
            list: async () => ({ messages: [], total: 0 }),
            listTargets: async () => ({ targets: [], total: 0 }),
            listDeliveries: async () => [],
            cancel: async () => null,
            dispatchDue: async () => null,
            listPendingEmailMessages: async () => [],
            claimEmailTargets: async () => [],
            markEmailResult: async () => undefined,
            completeEmailForwarding: async () => undefined,
            ...overrides
        };
    }

    function message(id: string, overrides: Partial<StationMessageRecord> = {}): StationMessageRecord {
        return {
            id,
            senderAdminId: '1',
            senderAdminName: '调试管理员',
            title: '标题',
            body: '正文',
            audience: 'selected',
            forwardEmail: true,
            scheduledAt: null,
            status: 'sent',
            recipientCount: 1,
            deliveredCount: 1,
            emailSentCount: 0,
            emailFailedCount: 0,
            failureReason: null,
            createdAt: CREATED_AT,
            startedAt: CREATED_AT,
            completedAt: CREATED_AT,
            ...overrides
        };
    }

    test('dispatches the due batches it is handed', async () => {
        const dispatched: string[] = [];
        let remaining = 2;
        const repository = stubRepository({
            dispatchDue: async () => {
                if (remaining === 0) return null;
                remaining -= 1;
                dispatched.push(`batch-${remaining}`);
                return message(`batch-${remaining}`);
            }
        });
        const runner = new NodeStationMessageRunner(repository, { sendMessages: async () => [] });

        await runner.run();

        assert.deepEqual(dispatched, ['batch-1', 'batch-0']);
    });

    test('forwards stored messages and records each result', async () => {
        const marked: Array<{ accountId: string; result: StationMessageEmailResult }> = [];
        const batches = ['message-1'];
        const targets: StationMessageEmailTarget[] = [
            { accountId: 'acct-a', email: 'a@example.com', attempts: 1 },
            { accountId: 'acct-b', email: 'b@example.com', attempts: 1 }
        ];
        let claimed = false;
        const completed: string[] = [];
        const sent: PlatformEmailMessage[][] = [];

        const repository = stubRepository({
            findById: async (id) => message(id),
            listPendingEmailMessages: async () => batches,
            claimEmailTargets: async () => {
                if (claimed) return [];
                claimed = true;
                return targets;
            },
            markEmailResult: async (_id, accountId, result) => {
                marked.push({ accountId, result });
            },
            completeEmailForwarding: async (id) => {
                completed.push(id);
            }
        });
        const runner = new NodeStationMessageRunner(repository, {
            sendMessages: async (messages) => {
                sent.push([...messages]);
                return messages.map((entry) => ({
                    status: entry.recipient === 'a@example.com' ? 'sent' as const : 'failed' as const,
                    retryable: false,
                    message: entry.recipient === 'a@example.com' ? null : 'smtp rejected'
                }));
            }
        });

        await runner.run();

        assert.deepEqual(sent, [
            [
                { recipient: 'a@example.com', subject: '标题', text: '正文' },
                { recipient: 'b@example.com', subject: '标题', text: '正文' }
            ]
        ]);
        assert.deepEqual(
            marked.map((entry) => ({ accountId: entry.accountId, state: entry.result.state })),
            [
                { accountId: 'acct-a', state: 'sent' },
                { accountId: 'acct-b', state: 'failed' }
            ]
        );
        assert.deepEqual(completed, ['message-1']);
    });

    test('reports a failing batch without stopping the loop', async () => {
        const errors: string[] = [];
        const repository = stubRepository({
            dispatchDue: async () => {
                throw new Error('dispatch exploded');
            }
        });
        const runner = new NodeStationMessageRunner(
            repository,
            { sendMessages: async () => [] },
            { onError: (error) => errors.push(error.message) }
        );

        await runner.run();

        assert.deepEqual(errors, ['dispatch exploded']);
    });
});
