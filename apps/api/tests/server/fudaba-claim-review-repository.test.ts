import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { SqlFudabaRepository } from '@/infra/db/repositories/fudaba-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import type {
    AuditLogInput,
    CreateOwnedFudabaCardInput,
    NewFudabaCardInput,
    NewPlatformAccountInput
} from '@/ports/repositories';
import { seedCanonicalFudabaAgencies } from '../integration/fudaba-agency-fixture';
import {
    connectPostgresTestDatabase,
    createPostgresTestDatabase
} from './postgres-test-database';

const CREATED_AT = '2026-08-16T19:30:00.000Z';
const REVIEWED_AT = '2026-08-16T20:00:00.000Z';
const PROFILE_AT = 1_776_000_000_000;

function account(id: string): NewPlatformAccountInput {
    return {
        id,
        status: 'active',
        tokenVersion: 0,
        createdAt: PROFILE_AT,
        updatedAt: PROFILE_AT,
        deletedAt: null,
        profile: {
            displayName: `Producer ${id}`,
            avatarObjectKey: null,
            avatarExternalUrl: null,
            homeCity: null,
            bio: '',
            updatedAt: PROFILE_AT
        }
    };
}

function registeredCard(
    id: string,
    ownerAccountId: string,
    publicationStatus: NewFudabaCardInput['publicationStatus'] = 'published'
): NewFudabaCardInput {
    return {
        id,
        ownerAccountId,
        producerName: `Producer ${ownerAccountId}`,
        displayName: `Card ${id}`,
        seriesCode: '765',
        favoriteIdol: 'ignored compatibility input',
        favoriteIdolIds: [900_001],
        frontObjectKey: `community/fudaba/cards/${id}/front.webp`,
        backObjectKey: `community/fudaba/cards/${id}/back.webp`,
        accent: '#4f64dd',
        bio: '',
        tradeNote: '',
        available: true,
        sourceUrl: null,
        sourceLabel: null,
        sourceCredit: null,
        mediaRightsStatus: publicationStatus === 'published' ? 'approved' : 'unknown',
        publicationStatus,
        revision: 0,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        deletedAt: null
    };
}

function ownerCard(id: string, ownerAccountId: string): CreateOwnedFudabaCardInput {
    const card = registeredCard(id, ownerAccountId, 'pending');
    return {
        id: card.id,
        ownerAccountId: card.ownerAccountId,
        producerName: card.producerName,
        displayName: card.displayName,
        seriesCode: card.seriesCode,
        favoriteIdol: card.favoriteIdol,
        favoriteIdolIds: card.favoriteIdolIds,
        frontObjectKey: card.frontObjectKey,
        backObjectKey: card.backObjectKey,
        accent: card.accent,
        bio: card.bio,
        tradeNote: card.tradeNote,
        available: card.available,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt
    };
}

const audit: AuditLogInput = {
    username: 'reviewer',
    producername: 'Review Admin',
    action: 'review namecard claim',
    target: 'namecard',
    ip: '127.0.0.1',
    time: REVIEWED_AT
};

async function insertLegacyCard(
    database: ManagedSqlDatabase,
    suffix: string
): Promise<number> {
    // A legacy id also becomes a fudaba_cards.card_number below. Exchange
    // cards created earlier in the same test draw card_number from
    // namecard_number_seq independently of cards_id_seq, so without this the
    // two counters can hand out the same number from opposite directions.
    // The real migration keeps them disjoint the same way (advance whichever
    // sequence is behind); mirror that here instead of relying on call order.
    await database.prepare(
        `SELECT setval(
            'public.cards_id_seq',
            GREATEST(
                (SELECT COALESCE(max(card_number), 0) FROM public.fudaba_cards),
                (SELECT last_value FROM public.cards_id_seq)
            )
        )`
    ).run();
    const row = await database.prepare(
        `INSERT INTO cards
            (image1_url, image2_url, hash1, hash2, ip, status,
             withdrawal_token_hash, series_code, submission_kind, revision)
         VALUES (?, ?, ?, ?, '127.0.0.1', 'approved', ?, NULL, 'legacy', 0)
         RETURNING id`
    ).bind(
        `legacy/${suffix}/front.webp`,
        `legacy/${suffix}/back.webp`,
        `legacy-${suffix}-front`,
        `legacy-${suffix}-back`,
        suffix.repeat(64).slice(0, 64)
    ).first<{ id: number }>();
    if (!row) throw new Error('Legacy card fixture insert failed');
    // The unification backfill turns every legacy card into an ownerless
    // fudaba_cards row keyed by card_number; claim approval now binds onto
    // that row in place, so a fixture created after the migration already
    // ran has to mirror it by hand instead of relying on a fresh backfill.
    await database.prepare(
        `INSERT INTO fudaba_cards
            (id, card_number, origin, producer_name, display_name,
             series_code, favorite_idol, accent, bio, trade_note,
             front_object_key, back_object_key, available,
             media_rights_status, publication_status, revision,
             created_at, updated_at)
         VALUES (?, ?, 'legacy', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                 ?, ?, FALSE, 'approved', 'published', 0, ?, ?)`
    ).bind(
        `legacy-${row.id}`,
        row.id,
        `legacy/${suffix}/front.webp`,
        `legacy/${suffix}/back.webp`,
        CREATED_AT,
        CREATED_AT
    ).run();
    // Keep namecard_number_seq ahead of the explicit card_number just used,
    // the same way the real migration advances it past every legacy id, so a
    // later default-assigned exchange card_number cannot collide with it.
    await database.prepare(
        `SELECT setval(
            'public.namecard_number_seq',
            GREATEST(?, (SELECT last_value FROM public.namecard_number_seq))
        )`
    ).bind(row.id).run();
    return row.id;
}

async function insertBackofficeActor(
    database: ManagedSqlDatabase
): Promise<number> {
    const row = await database.prepare(
        `INSERT INTO backoffice_accounts
            (username, password, dept, producername, admin_role)
         VALUES ('claim-reviewer', 'hash', 'op', 'Review Admin', 'super_admin')
         RETURNING id`
    ).first<{ id: number }>();
    if (!row) throw new Error('Backoffice actor fixture insert failed');
    return row.id;
}

async function fixture(t: TestContext) {
    const database = await createPostgresTestDatabase(t, 'fudaba-claim-review');
    const siblingDatabase = connectPostgresTestDatabase(t, database);
    // The namecard_legacy_tables_read_only migration locks cards down for
    // the application; this suite's fixtures simulate pre-existing legacy
    // data directly in cards, so they bypass that guard the same way real
    // legacy data predates it.
    await database.prepare('ALTER TABLE public.cards DISABLE TRIGGER ALL').run();
    await seedCanonicalFudabaAgencies(database);
    const schema = new PostgresqlSchemaStrategy();
    const platform = new SqlPlatformAccountRepository(database, schema);
    const fudaba = new SqlFudabaRepository(database, schema);
    const sibling = new SqlFudabaRepository(siblingDatabase, schema);
    await Promise.all([
        platform.initialize(),
        fudaba.initialize(),
        sibling.initialize()
    ]);
    return { database, platform, fudaba, sibling };
}

test('PostgreSQL claim envelopes, claims, and registered reviews are atomic CAS workflows', async (t) => {
    const { database, platform, fudaba, sibling } = await fixture(t);
    const ownerA = 'claim-owner-a';
    const ownerB = 'claim-owner-b';
    const ownerC = 'claim-owner-c';
    await Promise.all([
        platform.createAccountWithProfile(account(ownerA)),
        platform.createAccountWithProfile(account(ownerB)),
        platform.createAccountWithProfile(account(ownerC))
    ]);
    const reviewedBy = await insertBackofficeActor(database);

    const legacyId = await insertLegacyCard(database, 'a');
    const matchingCardId = String(legacyId);
    await fudaba.createCard(registeredCard(matchingCardId, ownerA));
    await fudaba.createCard(registeredCard(`0${legacyId}`, ownerA));

    const createdEnvelopes = await fudaba.ensureSameIdLegacyCardEnvelopes({
        title: '发现同 ID 历史名片',
        body: '请确认这是否是你的历史名片。',
        createdAt: CREATED_AT
    });
    assert.equal(createdEnvelopes.length, 1);
    assert.equal(createdEnvelopes[0].recipient_account_id, ownerA);
    assert.equal(createdEnvelopes[0].legacy_card_id, legacyId);
    assert.deepEqual(await fudaba.ensureSameIdLegacyCardEnvelopes({
        title: '发现同 ID 历史名片',
        body: '请确认这是否是你的历史名片。',
        createdAt: CREATED_AT
    }), []);

    const envelope = createdEnvelopes[0];
    const claimId = 'same-id-claim';
    assert.deepEqual(await fudaba.confirmLegacyCardEnvelope({
        envelopeId: envelope.id,
        recipientAccountId: ownerB,
        expectedRevision: 0,
        id: 'wrong-recipient-claim',
        targetCardId: matchingCardId,
        seriesCode: '765',
        idolIds: [900_001],
        message: '',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        actionedAt: CREATED_AT
    }), { status: 'unavailable' });

    const confirmed = await fudaba.confirmLegacyCardEnvelope({
        envelopeId: envelope.id,
        recipientAccountId: ownerA,
        expectedRevision: 0,
        id: claimId,
        targetCardId: matchingCardId,
        seriesCode: 'cg',
        idolIds: [900_001, 900_002],
        message: '这是我的旧名片',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        actionedAt: CREATED_AT
    });
    assert.equal(confirmed.status, 'created');
    if (confirmed.status !== 'created') return;
    assert.equal(confirmed.envelope.action_state, 'confirmed');
    assert.equal(confirmed.envelope.claim_id, claimId);
    assert.deepEqual(
        confirmed.claim.favorite_idols.map((idol) => idol.idol_id),
        [900_001, 900_002]
    );
    assert.deepEqual(await fudaba.listLegacyNamecardClaimStatuses(
        [legacyId],
        ownerA
    ), [{
        legacy_card_id: legacyId,
        claim_status: 'pending',
        viewer_claim_state: 'pending'
    }]);
    const adminClaim = await fudaba.findAdminCardClaim(claimId);
    assert.equal(adminClaim?.claimant_display_name, 'Producer claim-owner-a');
    assert.equal(adminClaim?.legacy_image1_url, 'legacy/a/front.webp');
    assert.deepEqual(await fudaba.confirmLegacyCardEnvelope({
        envelopeId: envelope.id,
        recipientAccountId: ownerA,
        expectedRevision: 0,
        id: claimId,
        targetCardId: matchingCardId,
        seriesCode: 'cg',
        idolIds: [900_001, 900_002],
        message: '重放',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        actionedAt: CREATED_AT
    }), { status: 'conflict', revision: 1 });

    const blockedSecondClaim = await fudaba.createCardClaimForOwner({
        id: 'blocked-second-claim',
        legacyCardId: legacyId,
        claimantAccountId: ownerB,
        targetCardId: null,
        seriesCode: '765',
        idolIds: [900_001],
        message: '',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT
    });
    assert.equal(blockedSecondClaim.status, 'conflict');

    const beginResults = await Promise.all([
        fudaba.beginCardClaimReview(claimId, 0),
        sibling.beginCardClaimReview(claimId, 0)
    ]);
    assert.deepEqual(
        beginResults.map((result) => result.status).sort(),
        ['claimed', 'conflict']
    );
    const claimCompleted = await fudaba.completeCardClaimReview({
        claimId,
        approvingRevision: 1,
        decision: 'approve',
        target: { kind: 'existing', cardId: matchingCardId },
        reviewedBy,
        reviewedAt: REVIEWED_AT,
        reviewNote: '身份信息一致',
        notificationTitle: '名片认领已通过',
        notificationBody: '历史名片已经绑定。',
        audit
    });
    assert.equal(claimCompleted.status, 'saved');
    if (claimCompleted.status !== 'saved') return;
    assert.equal(claimCompleted.claim.state, 'approved');
    assert.equal(claimCompleted.card?.legacy_card_id, legacyId);
    assert.equal((await fudaba.findCardById(matchingCardId))?.legacy_card_id, legacyId);
    // The ownerless legacy row this claim bound onto must stop showing up
    // twice: it stays in place (guest attributes/reactions history are not
    // lost) but gets soft deleted so it drops off every compat read path.
    const hiddenLegacyRow = await fudaba.findCardById(`legacy-${legacyId}`);
    assert.equal(hiddenLegacyRow?.owner_account_id, null);
    assert.notEqual(hiddenLegacyRow?.deleted_at, null);
    assert.deepEqual(await fudaba.listLegacyNamecardClaimStatuses(
        [legacyId],
        ownerA
    ), [{
        legacy_card_id: legacyId,
        claim_status: 'claimed',
        viewer_claim_state: 'approved'
    }]);
    const ownerAEnvelopes = await fudaba.listClaimEnvelopesForOwner(ownerA, 20);
    const approvedEnvelope = ownerAEnvelopes.find(
        (item) => item.kind === 'claim-approved'
    );
    assert.ok(approvedEnvelope);
    const readEnvelope = await fudaba.markClaimEnvelopeRead({
        envelopeId: approvedEnvelope.id,
        recipientAccountId: ownerA,
        expectedRevision: 0,
        readAt: REVIEWED_AT
    });
    assert.equal(readEnvelope.status, 'saved');
    if (readEnvelope.status !== 'saved') return;
    assert.equal(readEnvelope.envelope.read_at, REVIEWED_AT);
    assert.deepEqual(await fudaba.markClaimEnvelopeRead({
        envelopeId: approvedEnvelope.id,
        recipientAccountId: ownerA,
        expectedRevision: 0,
        readAt: REVIEWED_AT
    }), { status: 'conflict', revision: 1 });
    const replay = await fudaba.completeCardClaimReview({
        claimId,
        approvingRevision: 1,
        decision: 'approve',
        target: { kind: 'existing', cardId: matchingCardId },
        reviewedBy,
        reviewedAt: REVIEWED_AT,
        reviewNote: '重放',
        notificationTitle: '名片认领已通过',
        notificationBody: '历史名片已经绑定。',
        audit
    });
    assert.equal(replay.status, 'conflict');
    await assert.rejects(
        database.prepare(
            'UPDATE fudaba_cards SET legacy_card_id=? WHERE id=?'
        ).bind(legacyId, `0${legacyId}`).run(),
        /fudaba_cards_legacy_card_id_key/
    );

    const raceLegacyId = await insertLegacyCard(database, 'r');
    const raceResults = await Promise.all([
        fudaba.createCardClaimForOwner({
            id: 'race-claim-a',
            legacyCardId: raceLegacyId,
            claimantAccountId: ownerA,
            targetCardId: null,
            seriesCode: '765',
            idolIds: [900_001],
            message: '',
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT
        }),
        sibling.createCardClaimForOwner({
            id: 'race-claim-b',
            legacyCardId: raceLegacyId,
            claimantAccountId: ownerB,
            targetCardId: null,
            seriesCode: 'cg',
            idolIds: [900_002],
            message: '',
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT
        })
    ]);
    assert.deepEqual(
        raceResults.map((result) => result.status).sort(),
        ['conflict', 'created']
    );

    for (const [suffix, idolIds] of [
        ['e', []],
        ['d', [900_001, 900_001]],
        ['m', [999_999]],
        ['x', Array.from({ length: 21 }, (_, index) => 910_000 + index)]
    ] as const) {
        const invalidLegacyId = await insertLegacyCard(database, suffix);
        assert.deepEqual(await fudaba.createCardClaimForOwner({
            id: `invalid-claim-${suffix}`,
            legacyCardId: invalidLegacyId,
            claimantAccountId: ownerA,
            targetCardId: null,
            seriesCode: '765',
            idolIds: [...idolIds],
            message: '',
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT
        }), { status: 'unavailable' });
    }

    const wrongOwnerLegacyId = await insertLegacyCard(database, 'w');
    assert.deepEqual(await fudaba.createCardClaimForOwner({
        id: 'wrong-owner-target',
        legacyCardId: wrongOwnerLegacyId,
        claimantAccountId: ownerB,
        targetCardId: matchingCardId,
        seriesCode: '765',
        idolIds: [900_001],
        message: '',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT
    }), { status: 'unavailable' });

    const createLegacyId = await insertLegacyCard(database, 'c');
    const createClaim = await fudaba.createCardClaimForOwner({
        id: 'create-card-claim',
        legacyCardId: createLegacyId,
        claimantAccountId: ownerB,
        targetCardId: null,
        seriesCode: 'cg',
        idolIds: [900_001, 900_002],
        message: '请创建绑定后的名片',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT
    });
    assert.equal(createClaim.status, 'created');
    const createBegin = await fudaba.beginCardClaimReview('create-card-claim', 0);
    assert.equal(createBegin.status, 'claimed');
    // The legacy card is already the ownerless row 'legacy-<id>' the
    // unification backfill created, so the approve target binds onto that
    // same id in place instead of minting an unrelated new row.
    const boundCreateCardId = `legacy-${createLegacyId}`;
    const createdCardResult = await fudaba.completeCardClaimReview({
        claimId: 'create-card-claim',
        approvingRevision: 1,
        decision: 'approve',
        target: {
            kind: 'create',
            card: {
                id: boundCreateCardId,
                producerName: 'Claimed Producer',
                displayName: 'Claimed Card',
                frontObjectKey: `community/fudaba/cards/${boundCreateCardId}/front.webp`,
                backObjectKey: `community/fudaba/cards/${boundCreateCardId}/back.webp`,
                accent: '#4f64dd',
                bio: '',
                tradeNote: '',
                available: true
            }
        },
        reviewedBy,
        reviewedAt: REVIEWED_AT,
        reviewNote: '已核验原图',
        notificationTitle: '名片认领已通过',
        notificationBody: '已创建可管理的注册名片。',
        audit
    });
    assert.equal(createdCardResult.status, 'saved');
    if (createdCardResult.status !== 'saved') return;
    assert.equal(createdCardResult.card?.id, boundCreateCardId);
    assert.equal(createdCardResult.card?.legacy_card_id, createLegacyId);
    // origin/card_number are not part of FudabaCardRecord, so confirm the
    // in-place upgrade directly: the row keeps its original identity and
    // provenance instead of a second row appearing beside it.
    const boundCreateCardRow = await database.prepare(
        `SELECT origin, card_number FROM fudaba_cards WHERE id=?`
    ).bind(boundCreateCardId).first<{ origin: string; card_number: number }>();
    assert.equal(boundCreateCardRow?.origin, 'legacy');
    assert.equal(boundCreateCardRow?.card_number, createLegacyId);
    assert.equal(createdCardResult.card?.owner_account_id, ownerB);
    assert.equal(createdCardResult.card?.series_code, 'cg');
    assert.equal(createdCardResult.card?.publication_status, 'published');
    assert.equal(createdCardResult.card?.media_rights_status, 'approved');
    assert.equal(createdCardResult.card?.favorite_idol, '测试春香、测试卯月');
    assert.equal(
        createdCardResult.card?.front_object_key,
        `community/fudaba/cards/${boundCreateCardId}/front.webp`
    );
    assert.equal((await fudaba.softDeleteCardForOwner({
        cardId: boundCreateCardId,
        ownerAccountId: ownerB,
        expectedRevision: 1,
        deletedAt: REVIEWED_AT
    })).status, 'saved');
    assert.equal(
        (await fudaba.listLegacyNamecardClaimStatuses(
            [createLegacyId],
            ownerB
        ))[0]?.claim_status,
        'claimed'
    );

    const rejectedLegacyId = await insertLegacyCard(database, 'j');
    const rejectedClaim = await fudaba.createCardClaimForOwner({
        id: 'rejected-claim',
        legacyCardId: rejectedLegacyId,
        claimantAccountId: ownerC,
        targetCardId: null,
        seriesCode: '765',
        idolIds: [900_001],
        message: '',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT
    });
    assert.equal(rejectedClaim.status, 'created');
    assert.equal(
        (await fudaba.beginCardClaimReview('rejected-claim', 0)).status,
        'claimed'
    );
    const rejected = await fudaba.completeCardClaimReview({
        claimId: 'rejected-claim',
        approvingRevision: 1,
        decision: 'reject',
        reviewedBy,
        reviewedAt: REVIEWED_AT,
        reviewNote: '证据不足',
        notificationTitle: '名片认领未通过',
        notificationBody: '请补充证明后重新提交。',
        audit: { ...audit, action: 'reject namecard claim' }
    });
    assert.equal(rejected.status, 'saved');
    if (rejected.status !== 'saved') return;
    assert.equal(rejected.claim.state, 'rejected');
    assert.equal(rejected.card, null);
    assert.equal(
        (await fudaba.listClaimEnvelopesForOwner(ownerC, 20))
            .filter((item) => item.kind === 'claim-rejected').length,
        1
    );

    const declinedLegacyId = await insertLegacyCard(database, 'n');
    await fudaba.createCard(registeredCard(String(declinedLegacyId), ownerB));
    const [declineEnvelope] = await fudaba.ensureSameIdLegacyCardEnvelopes({
        title: '发现同 ID 历史名片',
        body: '请确认这是否是你的历史名片。',
        createdAt: CREATED_AT
    });
    assert.equal(declineEnvelope.legacy_card_id, declinedLegacyId);
    assert.deepEqual(await fudaba.actionClaimEnvelope({
        envelopeId: declineEnvelope.id,
        recipientAccountId: ownerA,
        action: 'decline',
        expectedRevision: 0,
        actionedAt: REVIEWED_AT
    }), { status: 'unavailable' });
    const declined = await fudaba.actionClaimEnvelope({
        envelopeId: declineEnvelope.id,
        recipientAccountId: ownerB,
        action: 'decline',
        expectedRevision: 0,
        actionedAt: REVIEWED_AT
    });
    assert.equal(declined.status, 'saved');
    assert.deepEqual(await fudaba.actionClaimEnvelope({
        envelopeId: declineEnvelope.id,
        recipientAccountId: ownerB,
        action: 'decline',
        expectedRevision: 0,
        actionedAt: REVIEWED_AT
    }), { status: 'conflict', revision: 1 });

    const reviewCardId = 'registered-review-card';
    const reviewCreated = await fudaba.createCardForOwner(ownerCard(reviewCardId, ownerC));
    assert.equal(reviewCreated.status, 'saved');
    const registeredBegin = await Promise.all([
        fudaba.beginRegisteredCardReview(reviewCardId, 0),
        sibling.beginRegisteredCardReview(reviewCardId, 0)
    ]);
    assert.deepEqual(
        registeredBegin.map((result) => result.status).sort(),
        ['claimed', 'conflict']
    );
    assert.deepEqual(await fudaba.updateCardMetadataForOwner({
        cardId: reviewCardId,
        ownerAccountId: ownerC,
        producerName: 'Blocked while reviewing',
        displayName: 'Blocked',
        seriesCode: '765',
        favoriteIdol: '',
        favoriteIdolIds: [900_001],
        accent: '#4f64dd',
        bio: '',
        tradeNote: '',
        available: true,
        expectedRevision: 1,
        updatedAt: REVIEWED_AT
    }), { status: 'unavailable' });
    const registeredComplete = await fudaba.completeRegisteredCardReview({
        cardId: reviewCardId,
        approvingRevision: 1,
        decision: 'publish',
        reviewedAt: REVIEWED_AT,
        audit: { ...audit, action: 'publish registered card' }
    });
    assert.equal(registeredComplete.status, 'saved');
    if (registeredComplete.status !== 'saved') return;
    assert.equal(registeredComplete.card.publication_status, 'published');
    assert.equal(registeredComplete.card.media_rights_status, 'approved');
    const registeredReplay = await fudaba.completeRegisteredCardReview({
        cardId: reviewCardId,
        approvingRevision: 1,
        decision: 'publish',
        reviewedAt: REVIEWED_AT,
        audit: { ...audit, action: 'publish registered card' }
    });
    assert.equal(registeredReplay.status, 'conflict');

    const rejectedCardId = 'registered-rejected-card';
    assert.equal(
        (await fudaba.createCardForOwner(ownerCard(rejectedCardId, ownerC))).status,
        'saved'
    );
    assert.equal(
        (await fudaba.beginRegisteredCardReview(rejectedCardId, 0)).status,
        'claimed'
    );
    const registeredRejected = await fudaba.completeRegisteredCardReview({
        cardId: rejectedCardId,
        approvingRevision: 1,
        decision: 'reject',
        reviewedAt: REVIEWED_AT,
        audit: { ...audit, action: 'reject registered card' }
    });
    assert.equal(registeredRejected.status, 'saved');
    if (registeredRejected.status !== 'saved') return;
    assert.equal(registeredRejected.card.publication_status, 'rejected');
    assert.equal(registeredRejected.card.media_rights_status, 'denied');

    const rollbackCardId = 'registered-review-rollback';
    assert.equal(
        (await fudaba.createCardForOwner(ownerCard(rollbackCardId, ownerC))).status,
        'saved'
    );
    assert.equal(
        (await fudaba.beginRegisteredCardReview(rollbackCardId, 0)).status,
        'claimed'
    );
    assert.equal(await fudaba.rollbackRegisteredCardReview(rollbackCardId, 1), true);
    const rolledBackCard = await fudaba.findRegisteredCardForAdmin(rollbackCardId);
    assert.equal(rolledBackCard?.publication_status, 'pending');
    assert.equal(rolledBackCard?.revision, 2);

    const rollbackLegacyId = await insertLegacyCard(database, 'q');
    assert.equal((await fudaba.createCardClaimForOwner({
        id: 'claim-review-rollback',
        legacyCardId: rollbackLegacyId,
        claimantAccountId: ownerC,
        targetCardId: null,
        seriesCode: '765',
        idolIds: [900_001],
        message: '',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT
    })).status, 'created');
    assert.equal(
        (await fudaba.beginCardClaimReview('claim-review-rollback', 0)).status,
        'claimed'
    );
    assert.equal(await fudaba.rollbackCardClaimReview('claim-review-rollback', 1), true);
    const rolledBackClaim = await fudaba.findAdminCardClaim('claim-review-rollback');
    assert.equal(rolledBackClaim?.state, 'pending');
    assert.equal(rolledBackClaim?.revision, 2);
});
