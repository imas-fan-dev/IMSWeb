import assert from 'node:assert/strict';
import test from 'node:test';
import {
    validateEventFields,
    validateEventIdParams,
    validateEventListQuery
} from '@/domains/events/request';
import {
    validateAdminNamecardListQuery,
    validateNamecardIdParams,
    validateNamecardListQuery
} from '@/domains/namecards/request';
import {
    validateNewsIdParams,
    validateNewsListQuery
} from '@/domains/news/request';
import { validateNewsSubmission } from '@/domains/news/submission';
import { encodeDescendingIdCursor } from '@/utils/validation/descending-id-cursor';

function rejects(run: () => unknown, message: RegExp): void {
    assert.throws(run, (error: Error & { status?: number }) => {
        assert.equal(error.status, 400);
        assert.match(error.message, message);
        return true;
    });
}

test('event request models normalize valid fields and reject ambiguous values', () => {
    assert.deepEqual(validateEventIdParams({ id: '42' }), { id: 42 });
    rejects(() => validateEventIdParams({ id: '01' }), /活动 ID/);
    assert.deepEqual(validateEventFields({
        title: '  社区活动  ',
        name: '  IMSWeb  ',
        contact: '  https://example.test/event  '
    }), {
        title: '社区活动',
        name: 'IMSWeb',
        contact: 'https://example.test/event'
    });
    rejects(() => validateEventFields({
        title: '活动\n标题',
        name: 'IMSWeb',
        contact: 'https://example.test'
    }), /活动标题/);
    assert.deepEqual(validateEventListQuery({}), { mode: 'legacy', page: 1, size: 5 });
    assert.deepEqual(validateEventListQuery({ page: '2', size: '10' }), {
        mode: 'legacy',
        page: 2,
        size: 10
    });
    rejects(() => validateEventListQuery({ page: '1', limit: '10' }), /Cannot mix/);
});

test('news request models validate IDs, cursors, URLs, and normalized text', () => {
    assert.deepEqual(validateNewsIdParams({ id: '7' }), { id: 7 });
    rejects(() => validateNewsIdParams({ id: 'not-a-number' }), /资讯 ID/);
    assert.deepEqual(validateNewsListQuery({}), { mode: 'legacy' });
    const cursorValue = encodeDescendingIdCursor({ snapshotId: '10', afterId: '8' });
    assert.deepEqual(validateNewsListQuery({ limit: '5', cursor: cursorValue }), {
        mode: 'cursor',
        limit: 5,
        cursor: { snapshotId: '10', afterId: '8' }
    });
    rejects(() => validateNewsListQuery({ limit: '01' }), /limit/);
    assert.deepEqual(validateNewsSubmission({
        title: '  新资讯  ',
        content: 'https://example.test/news'
    }), {
        title: '新资讯',
        content: 'https://example.test/news'
    });
    rejects(() => validateNewsSubmission({ title: '资讯', content: 'javascript:alert(1)' }),
        /标题或链接/);
});

test('namecard request models enforce canonical IDs and bounded pagination', () => {
    assert.deepEqual(validateNamecardIdParams({ id: '9' }), { id: 9 });
    rejects(() => validateNamecardIdParams({ id: '-1' }), /名片 ID/);
    assert.deepEqual(validateNamecardListQuery({}), { page: 1, size: 25 });
    assert.deepEqual(validateNamecardListQuery({ page: '3', size: '12' }), {
        page: 3,
        size: 12
    });
    assert.deepEqual(validateAdminNamecardListQuery({ page: '4' }), { page: 4 });
    rejects(() => validateNamecardListQuery({ size: '101' }), /size/);
    rejects(() => validateAdminNamecardListQuery({ page: '3x' }), /page/);
});
