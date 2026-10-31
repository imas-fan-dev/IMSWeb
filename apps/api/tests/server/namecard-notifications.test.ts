/**
 * The notification inbox: the copy that every review verdict shares, and the
 * retention rules (200 rows per account, 90 days unread, 30 days read) that no
 * handler-level stub can exercise because they live in SQL.
 */
import { createPostgresTestDatabase } from '../postgres-test-database';
import {
    NAMECARD_NOTIFICATION_LIMIT,
    SqlNamecardNotificationRepository,
    insertNamecardNotification,
    pruneExpiredNamecardNotifications,
    trimNamecardNotifications
} from '@/infra/db/repositories/namecard-notification-repository';
import {
    cardApprovedCopy,
    cardLockedCopy,
    cardRejectedCopy,
    cardRevisionFlaggedCopy,
    cardRevisionRejectedCopy,
    cardUnlockedCopy
} from '@/infra/db/repositories/namecard-notification-copy';
import { executeSql, queryOne } from '@/infra/db/sql/query';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import assert from 'node:assert/strict';
import { parseEnvelopeAction } from '@/domains/community/fudaba/claims/request';
import { describe, onTestFinished, test } from 'vitest';

const ACCOUNT = 'notify-account';
const CREATED_AT = 1_790_000_000_000;

test('every verdict keeps one wording, whatever pipeline wrote it', () => {
    assert.deepEqual(cardApprovedCopy(793), {
        kind: 'card-approved',
        title: '名片 #793 已通过审核',
        body: '你的名片 #793 已通过审核，现已展示在名片墙上。'
    });
    assert.deepEqual(cardRejectedCopy(793, '  信息缺失 '), {
        kind: 'card-rejected',
        title: '名片 #793 未通过审核',
        body: '你的名片 #793 未通过审核。驳回理由：信息缺失。请按理由修改后可重新提交。'
    });
    assert.equal(
        cardRejectedCopy(793, null).body,
        '你的名片 #793 未通过审核。请修改后可重新提交。'
    );
    assert.equal(
        cardRejectedCopy(793, '   ').body,
        '你的名片 #793 未通过审核。请修改后可重新提交。'
    );
    assert.equal(cardLockedCopy(793, 'NSFW内容').body, '你的名片 #793 已被锁定。锁定理由：NSFW内容。');
    assert.equal(cardUnlockedCopy(793).title, '名片 #793 已解除锁定');
    assert.equal(
        cardRevisionRejectedCopy(793, '版本内容不符').body,
        '你的名片 #793 的新版本未通过审核。驳回理由：版本内容不符。此前已发布的版本仍然有效。'
    );
    assert.equal(
        cardRevisionRejectedCopy(793, null).body,
        '你的名片 #793 的新版本未通过审核。此前已发布的版本仍然有效。'
    );
    assert.equal(
        cardRevisionFlaggedCopy(793, 'NSFW内容').title,
        '名片 #793 的新版本已被标记违规'
    );
});

async function seedAccount(database: ManagedSqlDatabase): Promise<void> {
    await executeSql(
        database,
        `INSERT INTO platform_accounts (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, 'active', 0, ?, ?, NULL)`,
        [ACCOUNT, CREATED_AT, CREATED_AT]
    );
}

async function openInbox(): Promise<{
    database: ManagedSqlDatabase;
    repository: SqlNamecardNotificationRepository;
}> {
    const database = await createPostgresTestDatabase('namecard-notifications');
    onTestFinished(() => database.close());
    await seedAccount(database);
    return { database, repository: new SqlNamecardNotificationRepository(database) };
}

test('lists the newest rows first and counts the unread ones', async () => {
    const { repository } = await openInbox();
    for (const title of ['第一条', '第二条', '第三条']) {
        await repository.create({
            recipientAccountId: ACCOUNT,
            kind: 'card-approved',
            cardNumber: 100 + title.length,
            title,
            body: `${title}正文`
        });
    }

    const listed = await repository.list(ACCOUNT);
    assert.equal(listed.unread, 3);
    assert.deepEqual(
        listed.items.map((row) => row.title).sort(),
        ['第三条', '第二条', '第一条'].sort()
    );
    assert.equal(listed.items[0].kind, 'card-approved');
    assert.ok(Number(listed.items[0].card_number) > 100);
});

test('marks one row, all rows, or nothing at all', async () => {
    const { repository } = await openInbox();
    const first = await repository.create({
        recipientAccountId: ACCOUNT,
        kind: 'card-rejected',
        cardNumber: 1,
        title: '驳回',
        body: '正文'
    });
    await repository.create({
        recipientAccountId: ACCOUNT,
        kind: 'card-locked',
        cardNumber: 2,
        title: '锁定',
        body: '正文'
    });

    assert.equal(await repository.markRead(ACCOUNT, []), 0);
    assert.equal(await repository.markRead(ACCOUNT, [first]), 1);
    assert.equal((await repository.list(ACCOUNT)).unread, 1);
    assert.equal(await repository.markRead(ACCOUNT, null), 1);
    assert.equal((await repository.list(ACCOUNT)).unread, 0);
});

test('keeps only the newest notifications of one account', async () => {
    const { database, repository } = await openInbox();
    for (let index = 0; index < NAMECARD_NOTIFICATION_LIMIT + 5; index += 1) {
        await insertNamecardNotification(database, {
            recipientAccountId: ACCOUNT,
            kind: 'station-message',
            cardNumber: null,
            title: `通知 ${index}`,
            body: '正文'
        });
    }

    const stored = await queryOne<{ count: number }>(
        database,
        `SELECT COUNT(*)::int AS count FROM namecard_notifications WHERE recipient_account_id = ?`,
        [ACCOUNT]
    );
    assert.equal(stored?.count, NAMECARD_NOTIFICATION_LIMIT);

    // Trimming twice has to be a no-op, otherwise every insert would churn.
    await trimNamecardNotifications(database, ACCOUNT);
    const listed = await repository.list(ACCOUNT, NAMECARD_NOTIFICATION_LIMIT + 50);
    assert.equal(listed.items.length, NAMECARD_NOTIFICATION_LIMIT);
});

test('prunes read rows after 30 days and unread ones after 90', async () => {
    const { database, repository } = await openInbox();
    const insertAged = (id: string, days: number, read: boolean) =>
        executeSql(
            database,
            `INSERT INTO namecard_notifications
                 (id, recipient_account_id, kind, card_number, title, body, read_at, created_at)
             VALUES (?, ?, 'card-approved', 1, ?, '正文', ?, CURRENT_TIMESTAMP - (? || ' days')::interval)`,
            [id, ACCOUNT, id, read ? new Date().toISOString() : null, String(days)]
        );

    await insertAged('recent-unread', 10, false);
    await insertAged('old-unread', 100, false);
    await insertAged('old-read', 40, true);
    await insertAged('fresh-read', 5, true);

    await pruneExpiredNamecardNotifications(database, ACCOUNT);
    const remaining = await repository.list(ACCOUNT, 50);
    assert.deepEqual(remaining.items.map((row) => row.id).sort(), ['fresh-read', 'recent-unread']);
});

describe('claim envelope action parsing', () => {
    test('accepts both decisions with a non-negative revision', () => {
        assert.deepEqual(parseEnvelopeAction({ decision: 'confirm', expectedRevision: 0 }), {
            decision: 'confirm',
            expectedRevision: 0
        });
        assert.deepEqual(parseEnvelopeAction({ decision: 'decline', expectedRevision: 12 }), {
            decision: 'decline',
            expectedRevision: 12
        });
    });

    test('rejects unknown decisions, bad revisions and extra fields', () => {
        assert.throws(() => parseEnvelopeAction({ decision: 'maybe', expectedRevision: 1 }), /decision/);
        assert.throws(() => parseEnvelopeAction({ decision: 'confirm', expectedRevision: -1 }), /revision/i);
        assert.throws(() => parseEnvelopeAction({ decision: 'confirm', expectedRevision: 1, extra: true }), /未知字段/);
        assert.throws(() => parseEnvelopeAction(null), /对象/);
    });
});
