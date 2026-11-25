import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { onTestFinished, test, vi } from 'vitest';
import { openValkeyMailQueue } from '@/infra/cache/valkey/mail-queue';
import { NodeValkeyMailRunner } from '@/runtime/node-valkey-mail-runner';

const queueUrl = process.env.IMS_TEST_MAIL_QUEUE_URL;

// A dedicated logical test DB, separate from the compiled API fixture.
function testQueueUrl(): string {
    const url = new URL(queueUrl!);
    url.pathname = '/14';
    return url.toString();
}

test.skipIf(!queueUrl)('Valkey leases fence stale claims and retain SMTP outcomes across workers', async () => {
    const producer = await openValkeyMailQueue(testQueueUrl());
    onTestFinished(() => producer.close());
    const consumer = await openValkeyMailQueue(testQueueUrl());
    onTestFinished(() => consumer.close());
    const job = { kind: 'station', jobId: randomUUID(), messageId: 'message', accountId: 'account', maxAttempts: 3 } as const;
    assert.equal(await producer.enqueue(job), true);
    assert.equal(await producer.enqueue(job), false);
    const [first] = await consumer.claim('station', 1);
    assert.deepEqual(first.job, job);
    assert.deepEqual(await producer.claim('station', 1), []);
    assert.equal(await consumer.beginAttempt(first), true);
    assert.equal(await consumer.beginAttempt(first), false);
    assert.equal(await consumer.retry(first, 0), true);
    const [second] = await producer.claim('station', 1);
    assert.equal(second.attempts, 1);
    assert.equal(second.attemptInProgress, undefined);
    assert.equal(await consumer.ack(first), false);
    assert.equal(await consumer.recordOutcome(first, { failure: 'stale' }), false);
    assert.equal(await producer.beginAttempt(second), true);
    const outcome = { acceptedAt: Date.now() };
    assert.equal(await producer.recordOutcome(second, outcome), true);
    assert.equal(await producer.retry(second, 0), true);
    const [resumed] = await consumer.claim('station', 1);
    assert.equal(resumed.attempts, 2);
    assert.deepEqual(resumed.outcome, outcome);
    assert.equal(await consumer.beginAttempt(resumed), false);
    assert.equal(await consumer.ack(resumed), true);
});

test.skipIf(!queueUrl)('station worker retries PostgreSQL settlement without resending accepted mail', async () => {
    const queue = await openValkeyMailQueue(testQueueUrl());
    const job = { kind: 'station', jobId: randomUUID(), messageId: 'message', accountId: 'account', maxAttempts: 3 } as const;
    assert.equal(await queue.enqueue(job), true);
    const outcome = { acceptedAt: Date.now() };
    const send = vi.fn(async () => ({ status: 'accepted' as const, ...outcome }));
    const settle = vi.fn(async () => undefined).mockRejectedValueOnce(new Error('temporary database failure'));
    const worker = new NodeValkeyMailRunner(queue, {
        findVerificationCandidate: async () => null,
        settleVerificationCandidate: async () => undefined,
    }, {
        listPendingStationMail: async () => [],
        findPendingStationMail: async () => ({ recipient: 'test@example.test', subject: 'Subject', text: 'Body' }),
        settleStationMail: settle,
    }, {
        encrypt() { throw new Error('unexpected encryption'); },
        decrypt() { throw new Error('unexpected decryption'); },
    }, {
        deliverVerification: async () => { throw new Error('unexpected OTP'); },
        deliverMessage: send,
    });
    onTestFinished(async () => {
        await worker.close();
        queue.close();
    });
    worker.start();
    await vi.waitFor(() => {
        assert.equal(settle.mock.calls.length, 2);
        assert.equal(send.mock.calls.length, 1);
        assert.deepEqual(settle.mock.calls[1], [job.messageId, job.accountId, outcome]);
    }, { timeout: 4_000 });
});
