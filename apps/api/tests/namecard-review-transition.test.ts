import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    classifyNamecardReviewRetry,
    planNamecardReview,
    type NamecardReviewAction,
    type NamecardReviewState
} from '@/ports/repositories/fudaba-review-policy';

/** 首投：卡片自己在队列里（`pending`，被认领后是 `approving`）。 */
function submission(publicationStatus = 'pending'): NamecardReviewState {
    return { publicationStatus, reviewStatus: null };
}

/** 改版：已上墙的卡上挂着一份待审改版。 */
function revision(publicationStatus = 'published'): NamecardReviewState {
    return { publicationStatus, reviewStatus: 'pending' };
}

/** 判定结果的紧凑投影：落点与拒绝原因都能直接 `deepEqual`。 */
function summary(state: NamecardReviewState, action: NamecardReviewAction) {
    const plan = planNamecardReview(state, action);
    if (!plan.allowed) return { refused: plan.reason };
    return {
        subject: plan.subject,
        publicationStatus: plan.publicationStatus,
        reviewStatus: plan.reviewStatus,
        promotesPages: plan.promotesPages,
        tombstones: plan.tombstones,
        revisionDelta: plan.revisionDelta
    };
}

test('首投判决落在卡片自身，改版判决落在待审副本上', () => {
    assert.deepEqual(summary(submission(), 'publish'), {
        subject: 'submission',
        publicationStatus: 'published',
        reviewStatus: null,
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
    assert.deepEqual(summary(submission(), 'reject'), {
        subject: 'submission',
        publicationStatus: 'rejected',
        reviewStatus: null,
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
    assert.deepEqual(summary(submission(), 'flag'), {
        subject: 'submission',
        publicationStatus: 'locked',
        reviewStatus: null,
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
    // 改版通过要把待审页对象一起提升到线上，卡片本身一直是 published。
    assert.deepEqual(summary(revision(), 'publish'), {
        subject: 'revision',
        publicationStatus: 'published',
        reviewStatus: null,
        promotesPages: true,
        tombstones: false,
        revisionDelta: 1
    });
    assert.deepEqual(summary(revision(), 'reject'), {
        subject: 'revision',
        publicationStatus: 'published',
        reviewStatus: 'rejected',
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
    assert.deepEqual(summary(revision(), 'flag'), {
        subject: 'revision',
        publicationStatus: 'published',
        reviewStatus: 'locked',
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
});

test('锁定是终态处置：丢弃待审改版，首投和改版都适用', () => {
    assert.deepEqual(summary(submission(), 'lock'), {
        subject: 'submission',
        publicationStatus: 'locked',
        reviewStatus: null,
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
    assert.deepEqual(summary(revision(), 'lock'), {
        subject: 'revision',
        publicationStatus: 'locked',
        reviewStatus: null,
        promotesPages: false,
        tombstones: false,
        revisionDelta: 1
    });
});

test('删除只把整行下架，不动线上状态', () => {
    assert.deepEqual(summary(submission(), 'delete'), {
        subject: 'submission',
        publicationStatus: 'pending',
        reviewStatus: null,
        promotesPages: false,
        tombstones: true,
        revisionDelta: 1
    });
    assert.deepEqual(summary(revision(), 'delete'), {
        subject: 'revision',
        publicationStatus: 'published',
        reviewStatus: null,
        promotesPages: false,
        tombstones: true,
        revisionDelta: 1
    });
});

test('解锁只从锁定态出发，把卡放回待审队列', () => {
    assert.deepEqual(
        summary({ publicationStatus: 'locked', reviewStatus: null }, 'unlock'),
        {
            subject: 'submission',
            publicationStatus: 'pending',
            reviewStatus: null,
            promotesPages: false,
            tombstones: false,
            revisionDelta: 1
        }
    );
    assert.deepEqual(summary(submission(), 'unlock'), { refused: 'conflict' });
    assert.deepEqual(summary(revision(), 'unlock'), { refused: 'conflict' });
});

test('已撤回的卡不再接受判决，但可以被删除', () => {
    const withdrawn: NamecardReviewState = {
        publicationStatus: 'withdrawn',
        reviewStatus: null
    };
    for (const action of ['publish', 'reject', 'flag', 'lock', 'unlock'] as const) {
        assert.deepEqual(summary(withdrawn, action), { refused: 'withdrawn' });
    }
    assert.deepEqual(summary(withdrawn, 'delete'), {
        subject: 'submission',
        publicationStatus: 'withdrawn',
        reviewStatus: null,
        promotesPages: false,
        tombstones: true,
        revisionDelta: 1
    });
});

test('没有可判对象的行一律冲突：已上墙无改版、已锁定', () => {
    const published: NamecardReviewState = {
        publicationStatus: 'published',
        reviewStatus: null
    };
    for (const action of ['publish', 'reject', 'flag'] as const) {
        assert.deepEqual(summary(published, action), { refused: 'conflict' });
    }
    const locked: NamecardReviewState = {
        publicationStatus: 'locked',
        reviewStatus: null
    };
    assert.deepEqual(summary(locked, 'publish'), { refused: 'conflict' });
    assert.deepEqual(summary(locked, 'reject'), { refused: 'conflict' });
    assert.deepEqual(summary(locked, 'lock'), { refused: 'conflict' });
});

test('失败恢复：认领过的行留在 approving，绝不回到 pending', () => {
    const claimed = submission('approving');
    for (const action of ['publish', 'reject', 'flag', 'lock', 'delete'] as const) {
        const plan = planNamecardReview(claimed, action);
        assert.equal(plan.allowed, true, action);
        if (!plan.allowed) continue;
        assert.notEqual(plan.publicationStatus, 'pending', action);
        assert.equal(plan.revisionDelta, 1, action);
    }
});

test('失败恢复：拿最新 revision 重试续做，陈旧或无关的状态才冲突', () => {
    const claimed = {
        publicationStatus: 'approving',
        reviewStatus: null,
        revision: 7
    };
    assert.equal(classifyNamecardReviewRetry(claimed, 6), 'resumed');
    assert.equal(classifyNamecardReviewRetry(claimed, 7), 'resumed');
    assert.equal(classifyNamecardReviewRetry({ ...claimed, revision: 9 }, 7), 'conflict');
    assert.equal(
        classifyNamecardReviewRetry(
            { publicationStatus: 'withdrawn', reviewStatus: null, revision: 7 },
            6
        ),
        'withdrawn'
    );
    assert.equal(
        classifyNamecardReviewRetry(
            { publicationStatus: 'published', reviewStatus: null, revision: 7 },
            6
        ),
        'conflict'
    );
    // 待审改版同样可续做：认领只推进 revision，`review_status` 保持 `pending`。
    assert.equal(
        classifyNamecardReviewRetry(
            { publicationStatus: 'published', reviewStatus: 'pending', revision: 8 },
            7
        ),
        'resumed'
    );
});
