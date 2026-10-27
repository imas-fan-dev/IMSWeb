import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import {
    createPostgresTestDatabase,
    postgresTest,
} from '../postgres-test-database';
import { executeSql } from '@/infra/db/sql/query';
import {
    cardApprovedCopy,
    cardLockedCopy,
    cardRejectedCopy,
    cardUnlockedCopy,
} from '@/infra/db/repositories/namecard-notification-copy';
import { SqlNamecardNotificationRepository } from '@/infra/db/repositories/namecard-notification-repository';
import { parseEnvelopeAction } from '@/domains/community/fudaba/claims/request';

async function seedAccount(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    id: string,
): Promise<void> {
    await executeSql(
        database,
        `INSERT INTO public.platform_accounts
             (id, status, token_version, created_at, updated_at, deleted_at)
         VALUES (?, 'active', 0, ?, ?, NULL)`,
        [id, Date.now(), Date.now()],
    );
}

describe('namecard notification copy', () => {
    test('keeps approval, rejection, lock and unlock wording stable', () => {
        assert.deepEqual(cardApprovedCopy(42), {
            kind: 'card-approved',
            title: '名片 #42 已通过审核',
            body: '你的名片 #42 已通过审核，现已展示在名片墙上。',
        });
        assert.equal(cardRejectedCopy(7, '  图片不清楚  ').body.includes('驳回理由：图片不清楚。'), true);
        assert.equal(cardRejectedCopy(7, '   ').body, '你的名片 #7 未通过审核。请修改后可重新提交。');
        assert.equal(cardLockedCopy(9, '重复投稿').title, '名片 #9 已被锁定');
        assert.equal(cardUnlockedCopy(9).kind, 'card-unlocked');
    });
});

describe('claim envelope action parsing', () => {
    test('accepts both decisions with a non-negative revision', () => {
        assert.deepEqual(parseEnvelopeAction({ decision: 'confirm', expectedRevision: 0 }), {
            decision: 'confirm',
            expectedRevision: 0,
        });
        assert.deepEqual(parseEnvelopeAction({ decision: 'decline', expectedRevision: 12 }), {
            decision: 'decline',
            expectedRevision: 12,
        });
    });

    test('rejects unknown decisions, bad revisions and extra fields', () => {
        assert.throws(() => parseEnvelopeAction({ decision: 'maybe', expectedRevision: 1 }), /decision/);
        assert.throws(() => parseEnvelopeAction({ decision: 'confirm', expectedRevision: -1 }), /revision/i);
        assert.throws(() => parseEnvelopeAction({ decision: 'confirm', expectedRevision: 1, extra: true }), /未知字段/);
        assert.throws(() => parseEnvelopeAction(null), /对象/);
    });
});

describe('namecard notification repository', () => {
    postgresTest('creates, lists, marks read and prunes by retention', async () => {
        const database = await createPostgresTestDatabase('namecard-notifications');
        await seedAccount(database, 'notify-owner');
        const repository = new SqlNamecardNotificationRepository(database);

        const first = await repository.create({
            recipientAccountId: 'notify-owner',
            kind: 'card-approved',
            cardNumber: 3,
            title: '名片 #3 已通过审核',
            body: '已展示。',
        });
        await repository.create({
            recipientAccountId: 'notify-owner',
            kind: 'claim-rejected',
            cardNumber: null,
            title: '认领未通过',
            body: '请补充证明。',
        });
        const listed = await repository.list('notify-owner');
        assert.equal(listed.items.length, 2);
        assert.equal(listed.unread, 2);
        assert.equal((await repository.markRead('notify-owner', [])), 0);
        assert.equal((await repository.markRead('notify-owner', [first])), 1);
        assert.equal((await repository.list('notify-owner')).unread, 1);
        assert.equal((await repository.markRead('notify-owner', null)), 1);

        // Expired unread rows fall out on the next list; fresh rows stay.
        await executeSql(
            database,
            `INSERT INTO public.namecard_notifications
                 (id, recipient_account_id, kind, title, body, created_at)
             VALUES ('expired-unread', 'notify-owner', 'card-approved', '旧消息', '旧', CURRENT_TIMESTAMP - INTERVAL '91 days')`,
        );
        await executeSql(
            database,
            `INSERT INTO public.namecard_notifications
                 (id, recipient_account_id, kind, title, body, read_at, created_at)
             VALUES ('expired-read', 'notify-owner', 'card-approved', '旧消息', '旧', CURRENT_TIMESTAMP - INTERVAL '40 days', CURRENT_TIMESTAMP - INTERVAL '40 days')`,
        );
        assert.equal((await repository.list('notify-owner')).items.length, 2);
        const remaining = await database
            .prepare("SELECT COUNT(*)::int AS total FROM public.namecard_notifications WHERE id LIKE 'expired-%'")
            .first<{ total: number }>();
        assert.equal(remaining?.total, 0);
    });
});
