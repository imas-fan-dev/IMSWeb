import assert from 'node:assert/strict';
import test from 'node:test';
import {
    validateEventFields,
    validateEventIdParams,
    validateEventListQuery
} from '@/domains/content/events/request';
import { validateFudabaGuestSubmissionIdParams } from '@/domains/community/fudaba/guest-submissions/request';
import {
    validateAdminNamecardListQuery,
    validateNamecardListQuery
} from '@/domains/community/namecards/request';
import {
    validateCompatibleNewsDeleteParams,
    validateNewsIdParams,
    validateNewsListQuery
} from '@/domains/content/news/request';
import { validateNewsSubmission } from '@/domains/content/news/submission';
import { validateWikiAgencyIdParams } from '@/domains/content/wiki/request';
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
    assert.deepEqual(validateEventIdParams({ id: '01' }), { id: 1 });
    assert.deepEqual(validateEventIdParams({ id: 'not-an-id' }), { id: null });
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
    assert.equal(Number.isNaN(
        validateCompatibleNewsDeleteParams({ id: 'not-a-number' }).id
    ), true);
    assert.deepEqual(validateCompatibleNewsDeleteParams({ id: '01' }), { id: 1 });
    assert.deepEqual(validateCompatibleNewsDeleteParams({ id: '1e1' }), { id: 10 });
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

test('namecard request models enforce IDs and preserve legacy parseInt pagination', () => {
    assert.deepEqual(
        validateFudabaGuestSubmissionIdParams({ submissionId: '9' }),
        { id: 9 }
    );
    rejects(
        () => validateFudabaGuestSubmissionIdParams({ submissionId: '-1' }),
        /名片 ID/
    );
    assert.deepEqual(validateNamecardListQuery({}), { page: 1, size: 25 });
    assert.deepEqual(validateNamecardListQuery({ page: '3', size: '12' }), {
        page: 3,
        size: 12
    });
    assert.deepEqual(validateNamecardListQuery({ page: 'abc', size: 'abc' }), {
        page: 1,
        size: 25
    });
    assert.deepEqual(validateNamecardListQuery({ page: '0', size: '0' }), {
        page: 1,
        size: 25
    });
    assert.deepEqual(validateNamecardListQuery({ page: '1foo', size: '1foo' }), {
        page: 1,
        size: 1
    });
    assert.deepEqual(validateNamecardListQuery({ page: '101', size: '101' }), {
        page: 101,
        size: 101
    });
    assert.deepEqual(validateAdminNamecardListQuery({ page: 'abc' }), { page: 1 });
    assert.deepEqual(validateAdminNamecardListQuery({ page: '0' }), { page: 1 });
    assert.deepEqual(validateAdminNamecardListQuery({ page: '1foo' }), { page: 1 });
    assert.deepEqual(validateAdminNamecardListQuery({ page: '101' }), { page: 101 });
});

test('Wiki shared numeric params preserve Number aliases and reject non-positive IDs', () => {
    assert.deepEqual(validateWikiAgencyIdParams({ agencyId: '01' }), { id: 1 });
    assert.deepEqual(validateWikiAgencyIdParams({ agencyId: '1e1' }), { id: 10 });
    rejects(() => validateWikiAgencyIdParams({ agencyId: 'not-an-id' }), /企划 ID/);
    rejects(() => validateWikiAgencyIdParams({ agencyId: '0' }), /企划 ID/);
});
