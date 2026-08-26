import assert from 'node:assert/strict';
import test from 'node:test';
import { fudabaCardReactionsResponseSchema } from '@imsweb/contracts/fudaba';
import { createHonoApp } from '@/app';
import type {
    FudabaCardReactionInput,
    FudabaCardReactionRecord,
    FudabaRepository
} from '@/ports/repositories';
import type { RateLimiter } from '@/ports/cache';

const CARD_ID = 'card-reaction-1';
const PATH = `http://ims.test/api/community/exchange/cards/${CARD_ID}/reactions`;

class ControlledRateLimiter implements RateLimiter {
    private denied: string | null = null;

    denyBucket(bucket: string | null): void {
        this.denied = bucket;
    }

    async consume(
        bucket: string,
        _key: string,
        limit: number
    ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
        const allowed = this.denied !== bucket;
        return {
            allowed,
            remaining: allowed ? limit - 1 : 0,
            resetAt: Date.now() + 60_000
        };
    }
}

class ReactionFixture {
    readonly rateLimiter = new ControlledRateLimiter();
    readonly reactions = new Map<string, number>();
    publicReadEnabled = true;
    eligible = true;
    applyCalls: FudabaCardReactionInput[] = [];

    private repository(): FudabaRepository {
        return {
            listPublicCardReactions: async (
                cardId: string
            ): Promise<FudabaCardReactionRecord[]> => {
                if (cardId !== CARD_ID || !this.eligible) return [];
                return [...this.reactions.entries()]
                    .map(([emoji, count]) => ({ emoji, count }))
                    .sort((left, right) => right.count - left.count);
            },
            applyPublicCardReaction: async (
                input: FudabaCardReactionInput
            ): Promise<boolean> => {
                this.applyCalls.push(input);
                if (input.cardId !== CARD_ID || !this.eligible) return false;
                const current = this.reactions.get(input.emoji) ?? 0;
                const next = current + input.delta;
                if (next <= 0) this.reactions.delete(input.emoji);
                else this.reactions.set(input.emoji, next);
                return true;
            }
        } as unknown as FudabaRepository;
    }

    runtime() {
        return {
            fudaba: this.repository(),
            rateLimiter: this.rateLimiter,
            config: {
                fudabaPublicReadEnabled: this.publicReadEnabled
            }
        };
    }

    app() {
        return createHonoApp(() => this.runtime() as never);
    }
}

test('exchange card reactions are listed for anonymous visitors', async () => {
    const fixture = new ReactionFixture();
    fixture.reactions.set('❤️', 3);
    fixture.reactions.set('🎉', 1);

    const response = await fixture.app().request(PATH);

    assert.equal(response.status, 200);
    const body = fudabaCardReactionsResponseSchema.parse(await response.json());
    assert.deepEqual(body.reactions, [
        { emoji: '❤️', count: 3 },
        { emoji: '🎉', count: 1 }
    ]);
});

test('exchange card reactions increment and decrement anonymously', async () => {
    const fixture = new ReactionFixture();

    const added = await fixture.app().request(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '❤️' })
    });
    assert.equal(added.status, 200);
    assert.deepEqual(
        fudabaCardReactionsResponseSchema.parse(await added.json()).reactions,
        [{ emoji: '❤️', count: 1 }]
    );

    const removed = await fixture.app().request(PATH, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '❤️' })
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(
        fudabaCardReactionsResponseSchema.parse(await removed.json()).reactions,
        []
    );
    assert.deepEqual(fixture.applyCalls.map((call) => call.delta), [1, -1]);
});

test('exchange card reactions reject unsupported emoji and unknown cards', async () => {
    const fixture = new ReactionFixture();

    const unsupported = await fixture.app().request(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: 'not-an-emoji' })
    });
    assert.equal(unsupported.status, 400);
    assert.equal(
        (await unsupported.json() as { code: string }).code,
        'FUDABA_CARD_REACTION_INVALID'
    );
    assert.deepEqual(fixture.applyCalls, []);

    fixture.eligible = false;
    const missing = await fixture.app().request(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '❤️' })
    });
    assert.equal(missing.status, 404);
    assert.equal(
        (await missing.json() as { code: string }).code,
        'FUDABA_CARD_REACTION_NOT_FOUND'
    );
});

test('exchange card reactions share the namecard reaction rate limit', async () => {
    const fixture = new ReactionFixture();
    fixture.rateLimiter.denyBucket('reactions');

    const limited = await fixture.app().request(PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '❤️' })
    });

    assert.equal(limited.status, 429);
    assert.deepEqual(fixture.applyCalls, []);
});

test('exchange card reactions stay hidden when public read is disabled', async () => {
    const fixture = new ReactionFixture();
    fixture.publicReadEnabled = false;

    const response = await fixture.app().request(PATH);

    assert.equal(response.status, 404);
});
