import assert from 'node:assert/strict';
import { test } from 'node:test';
import { platformProfileMutationResponseSchema } from '@imsweb/contracts/platform';
import type { PlatformAccountStatus } from '@/ports/repositories';
import {
    ACCOUNT_ID,
    OwnerRouteFixture,
    bearerHeaders,
    mediaUpload,
    profileBody
} from '../fixtures/owner-route-fixture';

const PROFILE_URL = 'http://ims.test/api/platform/me';
const AVATAR_URL = 'http://ims.test/api/platform/me/avatar';
const SEEDED_UPDATED_AT = 1_000;

interface ErrorBody {
    code: string;
    message?: string;
    success: boolean;
}

// Moved out of the Fudaba owner-route suite: this exercises the identity
// domain's own read and write, and shares no fixture state with any card.
test('Platform profile GET and text update expose a fenced owner projection',
    async () => {
        const fixture = new OwnerRouteFixture();
        fixture.profile.avatar_object_key = 'protected/platform/avatar.webp';
        fixture.storage.seed(fixture.profile.avatar_object_key);
        const get = await fixture.app.request(PROFILE_URL, {
            headers: bearerHeaders()
        });
        assert.equal(get.status, 200);
        const initial = await get.json() as {
            account: { id: string; status: string };
            capabilities: { fudabaWrite: boolean };
            profile: { avatarUrl: string; updatedAt: number };
        };
        assert.deepEqual(initial.account, { id: ACCOUNT_ID, status: 'active' });
        assert.equal(initial.capabilities.fudabaWrite, true);
        assert.equal(initial.profile.avatarUrl,
            `/api/platform/me/avatar?v=${SEEDED_UPDATED_AT}`);
        assert.equal(JSON.stringify(initial).includes('avatar_object_key'), false);

        const expectedUpdatedAt = initial.profile.updatedAt;
        const saved = await fixture.app.request(PROFILE_URL, {
            method: 'PUT',
            headers: bearerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(profileBody(expectedUpdatedAt))
        });
        assert.equal(saved.status, 200);
        const savedBody = await saved.json() as {
            profile: { displayName: string; updatedAt: number };
        };
        platformProfileMutationResponseSchema.parse(savedBody);
        assert.equal(savedBody.profile.displayName, 'Updated Owner');
        assert.ok(savedBody.profile.updatedAt > expectedUpdatedAt);
        assert.equal(fixture.profileTextInputs[0]?.accountId, ACCOUNT_ID);

        // Replaying the same fence must lose, and the 409 has to carry the
        // timestamp the client needs to resynchronise.
        const stale = await fixture.app.request(PROFILE_URL, {
            method: 'PUT',
            headers: bearerHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify(profileBody(expectedUpdatedAt))
        });
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            success: false,
            code: 'PLATFORM_PROFILE_CONFLICT',
            updatedAt: savedBody.profile.updatedAt
        });
    });

function profileJson(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({ ...profileBody(SEEDED_UPDATED_AT), ...overrides });
}

async function putProfile(
    fixture: OwnerRouteFixture,
    body: string
): Promise<Response> {
    return fixture.app.request(PROFILE_URL, {
        method: 'PUT',
        headers: bearerHeaders({ 'content-type': 'application/json' }),
        body
    });
}

async function putAvatar(fixture: OwnerRouteFixture): Promise<Response> {
    return fixture.app.request(AVATAR_URL, {
        method: 'PUT',
        headers: bearerHeaders(),
        body: new FormData()
    });
}

const invalidSubmissions: Array<{
    body: string;
    label: string;
    message: string;
}> = [
    {
        label: 'malformed JSON',
        body: '{"displayName":',
        message: '请求体必须是有效 JSON'
    },
    { label: 'array body', body: '[]', message: '请求体必须是对象' },
    { label: 'null body', body: 'null', message: '请求体必须是对象' },
    { label: 'string body', body: '"owner"', message: '请求体必须是对象' },
    { label: 'number body', body: '7', message: '请求体必须是对象' },
    {
        label: 'unknown field',
        body: profileJson({ nickname: 'owner' }),
        message: '请求体包含未知字段'
    },
    {
        label: 'fractional expectedUpdatedAt',
        body: profileJson({ expectedUpdatedAt: 1000.5 }),
        message: 'expectedUpdatedAt 必须是非负整数'
    },
    {
        label: 'string expectedUpdatedAt',
        body: profileJson({ expectedUpdatedAt: '1000' }),
        message: 'expectedUpdatedAt 必须是非负整数'
    },
    {
        label: 'expectedUpdatedAt beyond the safe integer range',
        body: profileJson({ expectedUpdatedAt: Number.MAX_SAFE_INTEGER + 2 }),
        message: 'expectedUpdatedAt 必须是非负整数'
    },
    {
        label: 'negative expectedUpdatedAt',
        body: profileJson({ expectedUpdatedAt: -1 }),
        message: 'expectedUpdatedAt 必须是非负整数'
    },
    {
        label: 'blank displayName',
        body: profileJson({ displayName: '   ' }),
        message: 'displayName 长度无效'
    },
    {
        label: 'displayName over 80 characters',
        body: profileJson({ displayName: 'x'.repeat(81) }),
        message: 'displayName 长度无效'
    },
    {
        label: 'non-string displayName',
        body: profileJson({ displayName: 42 }),
        message: 'displayName 必须是字符串'
    },
    {
        label: 'homeCity over 100 characters',
        body: profileJson({ homeCity: 'x'.repeat(101) }),
        message: 'homeCity 长度无效'
    },
    {
        label: 'bio over 2000 characters',
        body: profileJson({ bio: 'x'.repeat(2001) }),
        message: 'bio 长度无效'
    }
];

test('Platform profile writes reject every malformed submission before the repository', async () => {
    const fixture = new OwnerRouteFixture();
    for (const { body, label, message } of invalidSubmissions) {
        const response = await putProfile(fixture, body);
        assert.equal(response.status, 400, label);
        const rejected = await response.json() as ErrorBody;
        assert.equal(rejected.success, false, label);
        assert.equal(rejected.code, 'PLATFORM_PROFILE_INVALID', label);
        assert.equal(rejected.message, message, label);
    }
    assert.equal(fixture.profileTextInputs.length, 0);
    assert.equal(fixture.profile.updated_at, SEEDED_UPDATED_AT);
});

test('Platform profile writes accept the boundary lengths their validator allows', async () => {
    const fixture = new OwnerRouteFixture();
    const response = await putProfile(fixture, profileJson({
        displayName: 'x'.repeat(80),
        homeCity: 'y'.repeat(100),
        bio: 'z'.repeat(2000)
    }));
    assert.equal(response.status, 200);
    assert.equal(fixture.profileTextInputs.length, 1);
    assert.equal(fixture.profile.display_name.length, 80);
    assert.equal(fixture.profile.home_city?.length, 100);
    assert.equal(fixture.profile.bio.length, 2000);

    const cleared = new OwnerRouteFixture();
    assert.equal((await putProfile(cleared, profileJson({
        homeCity: null,
        expectedUpdatedAt: 0
    }))).status, 409, 'a null homeCity still reaches optimistic-lock fencing');
    assert.equal(cleared.profileTextInputs[0]?.homeCity, null);
});

test('restricted Platform accounts keep profile reads but lose profile writes', async () => {
    const fixture = new OwnerRouteFixture({ accountStatus: 'restricted' });
    assert.equal((await fixture.app.request(PROFILE_URL, {
        headers: bearerHeaders()
    })).status, 200);

    const response = await putProfile(fixture, profileJson());
    assert.equal(response.status, 403);
    const rejected = await response.json() as ErrorBody;
    assert.equal(rejected.success, false);
    assert.equal(rejected.code, 'PLATFORM_ACCOUNT_RESTRICTED');
    assert.equal(fixture.profileTextInputs.length, 0);
    assert.equal(fixture.profile.updated_at, SEEDED_UPDATED_AT);
});

test('suspended and deleted Platform accounts lose the profile route entirely', async () => {
    const blocked: Array<[PlatformAccountStatus, string]> = [
        ['suspended', 'PLATFORM_ACCOUNT_SUSPENDED'],
        ['deleted', 'PLATFORM_ACCOUNT_UNAVAILABLE']
    ];
    for (const [status, code] of blocked) {
        const fixture = new OwnerRouteFixture({ accountStatus: status });
        const read = await fixture.app.request(PROFILE_URL, {
            headers: bearerHeaders()
        });
        assert.equal(read.status, 403, status);
        assert.equal((await read.json() as ErrorBody).code, code, status);

        const write = await putProfile(fixture, profileJson());
        assert.equal(write.status, 403, status);
        assert.equal((await write.json() as ErrorBody).code, code, status);
        assert.equal(fixture.profileTextInputs.length, 0, status);
        assert.equal(fixture.profile.updated_at, SEEDED_UPDATED_AT, status);
    }
});

test('anonymous callers cannot read or write the Platform profile', async () => {
    const fixture = new OwnerRouteFixture();
    const read = await fixture.app.request(PROFILE_URL);
    assert.equal(read.status, 401);
    assert.equal((await read.json() as ErrorBody).code, 'PLATFORM_SESSION_INVALID');

    const write = await fixture.app.request(PROFILE_URL, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: profileJson()
    });
    assert.equal(write.status, 401);
    assert.equal((await write.json() as ErrorBody).code, 'PLATFORM_SESSION_INVALID');
    assert.equal(fixture.profileTextInputs.length, 0);

    assert.equal((await fixture.app.request(AVATAR_URL)).status, 401);
});

test('Platform profile writes consume the shared Platform write budget', async () => {
    const limited = new OwnerRouteFixture();
    limited.rateLimiter.deniedBuckets.add('platform-write-account');
    const response = await putProfile(limited, profileJson());
    assert.equal(response.status, 429);
    assert.equal((await response.json() as ErrorBody).code, 'PLATFORM_RATE_LIMITED');
    assert.ok(Number(response.headers.get('retry-after')) > 0);
    assert.equal(limited.profileTextInputs.length, 0);
    assert.equal(limited.profile.updated_at, SEEDED_UPDATED_AT);

    const allowed = new OwnerRouteFixture();
    assert.equal((await putProfile(allowed, profileJson())).status, 200);
    assert.deepEqual(
        allowed.rateLimiter.calls.filter(
            (call) => call.bucket === 'platform-write-account'
        ),
        [{ bucket: 'platform-write-account', key: ACCOUNT_ID, limit: 120 }]
    );
});

test('Platform avatar reads stay 404 until the account stores an avatar object', async () => {
    const fixture = new OwnerRouteFixture();
    assert.equal(fixture.profile.avatar_object_key, null);
    for (const method of ['GET', 'HEAD'] as const) {
        const response = await fixture.app.request(AVATAR_URL, {
            method,
            headers: bearerHeaders()
        });
        assert.equal(response.status, 404, method);
        assert.equal(fixture.storage.readUrls.length, 0, method);
    }

    const key = 'protected/platform/avatars/owner.webp';
    fixture.profile.avatar_object_key = key;
    fixture.storage.seed(key);
    const served = await fixture.app.request(AVATAR_URL, {
        headers: bearerHeaders(),
        redirect: 'manual'
    });
    assert.equal(served.status, 307);
    assert.equal(served.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(fixture.storage.readUrls, [{ key, method: 'GET' }]);

    const missingObject = new OwnerRouteFixture();
    missingObject.profile.avatar_object_key = 'protected/platform/avatars/gone.webp';
    assert.equal((await missingObject.app.request(AVATAR_URL, {
        headers: bearerHeaders()
    })).status, 404, 'a dangling avatar key is a miss, not a 500');
});

// Display name, home city, and bio are Platform identity rather than Fudaba
// content, so neither rollout switch may gate the write. This pins the removal
// of the old `requireFudabaWrite` guard from the profile PUT.
test('Platform profile writes ignore the Fudaba rollout switch', async () => {
    const fixture = new OwnerRouteFixture({
        publicReadEnabled: false,
        writeEnabled: false
    });
    const read = await fixture.app.request(PROFILE_URL, { headers: bearerHeaders() });
    assert.equal(read.status, 200);
    assert.equal((await read.json() as {
        capabilities: { fudabaWrite: boolean };
    }).capabilities.fudabaWrite, false);

    const written = await putProfile(fixture, profileJson());
    assert.equal(written.status, 200);
    assert.equal(fixture.profileTextInputs.length, 1);
    assert.equal(fixture.profile.display_name, 'Updated Owner');
});

// Avatar upload used to live at PUT `/api/community/exchange/uploads/avatar`
// and spent the Fudaba upload budget. It now belongs to Platform identity, so a
// starved Fudaba budget must no longer reach it.
test('Platform avatar uploads spend a Platform budget, not the Fudaba one', async () => {
    for (const bucket of ['platform-avatar-upload-attempt', 'platform-upload-account']) {
        const fixture = new OwnerRouteFixture();
        fixture.rateLimiter.deniedBuckets.add(bucket);
        const response = await putAvatar(fixture);
        assert.equal(response.status, 429, bucket);
        assert.equal(fixture.uploads.calls.length, 0, bucket);
        assert.equal(fixture.storage.puts.length, 0, bucket);
    }

    // Only the account-scoped limiter speaks the Platform error envelope; the
    // attempt-level limiter rejects earlier, with its own transport-level body.
    const accountLimited = new OwnerRouteFixture();
    accountLimited.rateLimiter.deniedBuckets.add('platform-upload-account');
    const envelope = await putAvatar(accountLimited);
    assert.equal((await envelope.json() as ErrorBody).code, 'PLATFORM_RATE_LIMITED');

    const fudabaStarved = new OwnerRouteFixture();
    fudabaStarved.rateLimiter.deniedBuckets.add('fudaba-upload-attempt');
    fudabaStarved.uploads.next = mediaUpload({
        expectedUpdatedAt: String(SEEDED_UPDATED_AT)
    });
    const unaffected = await putAvatar(fudabaStarved);
    assert.equal(unaffected.status, 200, await unaffected.clone().text());
    const buckets = fudabaStarved.rateLimiter.calls.map((call) => call.bucket);
    assert.equal(buckets.includes('platform-avatar-upload-attempt'), true);
    assert.equal(buckets.includes('platform-upload-account'), true);
    assert.equal(buckets.includes('fudaba-upload-attempt'), false);
});

test('Platform avatar uploads ignore the Fudaba rollout switch', async () => {
    const fixture = new OwnerRouteFixture({
        publicReadEnabled: false,
        writeEnabled: false
    });
    fixture.uploads.next = mediaUpload({
        expectedUpdatedAt: String(SEEDED_UPDATED_AT)
    });
    const response = await putAvatar(fixture);
    const body = await response.text();
    assert.equal(response.status, 200, body);
    assert.equal(body.includes('object_key'), false);
    assert.equal(fixture.profileAvatarInputs.length, 1);

    // The stored key follows the domain move; historical keys under
    // `community/fudaba/accounts/` stay readable from their own profile rows.
    const stored = fixture.storage.puts.at(-1);
    assert.equal(stored?.key.startsWith(`platform/accounts/${ACCOUNT_ID}/avatars/`), true,
        stored?.key);
    assert.equal(stored?.options.protectedAccess, true);
    assert.equal(stored?.options.metadata?.kind, 'platform-avatar');
});

// Replacing an avatar is an optimistic-lock write against `profile.updatedAt`,
// and the object it replaces has to be swept or every re-upload strands a
// protected orphan. These assertions used to ride along with the Fudaba
// card-side CAS test, which shared one fixture for both domains.
test('avatar uploads commit under owner CAS and sweep the replaced object', async () => {
    const fixture = new OwnerRouteFixture();
    const oldAvatar = 'protected/platform/old-avatar.webp';
    fixture.profile.avatar_object_key = oldAvatar;
    fixture.storage.seed(oldAvatar);
    fixture.uploads.next = mediaUpload({
        expectedUpdatedAt: String(SEEDED_UPDATED_AT)
    });
    const response = await putAvatar(fixture);
    const body = await response.text();
    assert.equal(response.status, 200, body);
    assert.equal(body.includes('object_key'), false);
    assert.equal(fixture.profileAvatarInputs[0]?.accountId, ACCOUNT_ID);
    assert.equal(fixture.profileAvatarInputs[0]?.expectedUpdatedAt,
        SEEDED_UPDATED_AT);
    assert.equal(fixture.storage.objects.has(oldAvatar), false);

    assert.equal(fixture.storage.puts.length, 1);
    const stored = fixture.storage.puts[0];
    assert.equal(stored?.options.protectedAccess, true);
    assert.equal(stored?.options.metadata?.account, ACCOUNT_ID);
    assert.equal(fixture.storage.objects.has(stored!.key), true);
});

// A repository that commits and then loses its connection is ambiguous, not
// failed. The route must keep the object the committed row now points at.
test('a committed avatar write recovers after the repository throws', async () => {
    const fixture = new OwnerRouteFixture();
    const oldAvatar = 'protected/platform/ambiguous-old-avatar.webp';
    fixture.profile.avatar_object_key = oldAvatar;
    fixture.storage.seed(oldAvatar);
    fixture.updateAvatarMode = 'mutate-then-throw';
    fixture.uploads.next = mediaUpload({
        expectedUpdatedAt: String(SEEDED_UPDATED_AT)
    });
    const response = await putAvatar(fixture);
    const body = await response.text();
    assert.equal(response.status, 200, body);
    const avatarKey = fixture.profileAvatarInputs[0]?.avatarObjectKey;
    assert.ok(avatarKey);
    assert.equal(fixture.profile.avatar_object_key, avatarKey);
    assert.equal(fixture.storage.objects.has(avatarKey), true);
    assert.equal(fixture.storage.ownedDeletes.length, 0);
});

// Same ambiguity, one step later: the commit landed but the confirmation read
// failed, so the caller gets a 500 and the object still must survive.
test('a failed confirmation read preserves the ambiguous avatar object', async () => {
    const fixture = new OwnerRouteFixture();
    fixture.updateAvatarMode = 'mutate-then-throw';
    fixture.failProfileConfirmationRead = true;
    fixture.uploads.next = mediaUpload({
        expectedUpdatedAt: String(SEEDED_UPDATED_AT)
    });
    const response = await putAvatar(fixture);
    assert.equal(response.status, 500);
    const avatarKey = fixture.profileAvatarInputs[0]!.avatarObjectKey!;
    assert.equal(fixture.profile.avatar_object_key, avatarKey);
    assert.equal(fixture.storage.objects.has(avatarKey), true);
    assert.equal(fixture.storage.ownedDeletes.length, 0);
});

async function deleteAvatar(
    fixture: OwnerRouteFixture,
    body: unknown
): Promise<Response> {
    return fixture.app.request(AVATAR_URL, {
        method: 'DELETE',
        headers: { ...bearerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
}

test('avatar removal clears both avatar columns and sweeps the stored object',
    async () => {
        const fixture = new OwnerRouteFixture();
        const key = 'protected/platform/avatars/owner.webp';
        fixture.profile.avatar_object_key = key;
        fixture.profile.avatar_external_url = 'https://oauth.test/avatar.png';
        fixture.storage.seed(key);

        const response = await deleteAvatar(fixture, {
            expectedUpdatedAt: SEEDED_UPDATED_AT
        });
        const body = await response.text();
        assert.equal(response.status, 200, body);
        assert.equal(body.includes('object_key'), false);
        assert.equal(fixture.profile.avatar_object_key, null);
        assert.equal(fixture.profile.avatar_external_url, null,
            'an OAuth picture must go with the upload, or it silently returns');
        assert.equal(fixture.storage.objects.has(key), false);
        assert.ok(fixture.profile.updated_at > SEEDED_UPDATED_AT);

        const projected = JSON.parse(body) as { profile: { avatarUrl: null } };
        assert.equal(projected.profile.avatarUrl, null);
    });

test('avatar removal is fenced, validated, and refused for locked accounts',
    async () => {
        const stale = new OwnerRouteFixture();
        stale.profile.avatar_object_key = 'protected/platform/avatars/owner.webp';
        const conflict = await deleteAvatar(stale, {
            expectedUpdatedAt: SEEDED_UPDATED_AT - 1
        });
        assert.equal(conflict.status, 409);
        assert.equal((await conflict.json() as ErrorBody).code,
            'PLATFORM_PROFILE_CONFLICT');
        assert.equal(stale.profile.avatar_object_key,
            'protected/platform/avatars/owner.webp');

        for (const body of [
            {},
            { expectedUpdatedAt: -1 },
            { expectedUpdatedAt: 1.5 },
            { expectedUpdatedAt: '1000' },
            { expectedUpdatedAt: SEEDED_UPDATED_AT, displayName: 'x' }
        ]) {
            const fixture = new OwnerRouteFixture();
            const response = await deleteAvatar(fixture, body);
            assert.equal(response.status, 400, JSON.stringify(body));
            assert.equal((await response.json() as ErrorBody).code,
                'PLATFORM_AVATAR_REMOVE_INVALID', JSON.stringify(body));
        }

        const restricted = new OwnerRouteFixture({ accountStatus: 'restricted' });
        const refused = await deleteAvatar(restricted, {
            expectedUpdatedAt: SEEDED_UPDATED_AT
        });
        assert.equal(refused.status, 403);
        assert.equal((await refused.json() as ErrorBody).code,
            'PLATFORM_ACCOUNT_RESTRICTED');

        const anonymous = new OwnerRouteFixture();
        assert.equal((await anonymous.app.request(AVATAR_URL, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expectedUpdatedAt: SEEDED_UPDATED_AT })
        })).status, 401);
    });
