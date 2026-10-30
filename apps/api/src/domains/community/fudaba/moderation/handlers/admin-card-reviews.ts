import type {
    // pi-lens-ignore: ts:2305
    AdminCardSupplementDetailResponse,
    // pi-lens-ignore: ts:2305
    FudabaAdminCardClaimListResponse,
    // pi-lens-ignore: ts:2724
    FudabaRegisteredCardReviewListResponse,
    // pi-lens-ignore: ts:2305
    FudabaCardClaimError,
    // pi-lens-ignore: ts:2305
    ReviewQueueListResponse,
    // pi-lens-ignore: ts:2305
    ReviewQueueRow,
    // pi-lens-ignore: ts:2305
    SupplementListResponse,
    // pi-lens-ignore: ts:2305
    SupplementMutationResponse
} from '@imsweb/contracts/fudaba/card-claims';
import { adminNamecardMediaPath } from '@imsweb/contracts/paths';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import {
    parseCardReview,
    parseCardSupplementReview,
    parseReviewQueueQuery
} from '@/domains/community/fudaba/moderation/request';
import { fudabaCardSupplementView } from '@/domains/community/fudaba/claims/response';
import { fudabaAdminCardClaimView, fudabaRegisteredCardReviewView } from '@/domains/community/fudaba/moderation/response';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import {
    fudabaRepository,
    getClientAddress,
    services
} from '@/middleware/hono-context';
import type { ObjectStorage } from '@/ports/object-storage';
import { namecardMediaPath } from '@imsweb/contracts/paths';
import { resolvePublicObjectUrl } from '@/utils/storage/public-object-url';
import type { FudabaAdminCardClaimRecord } from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { objectReadResponse } from '@/utils/http/object-read-response';
import {
    namecardClaimMediaObjectKey,
    namecardMediaObjectKeys
} from '@/utils/storage/business-object-keys';
import {
    deleteOwnedObjectWithCompensation,
    protectObjectWithCompensation
} from '@/utils/storage/delete-object';

interface CreatedObject {
    key: string;
    ownerToken: string;
}

/** Legacy cards keep bare object keys, so the queue resolves them to URLs. */
async function legacyMediaUrl(
    storage: ObjectStorage | undefined,
    key: string | null,
    legacyCardId: number,
    side: 'front' | 'back'
): Promise<string> {
    const fallback = namecardMediaPath(legacyCardId, side);
    if (!storage || !key) return fallback;
    return resolvePublicObjectUrl(storage, key, fallback);
}

/** The queue merges three lists in memory, so each one is read in full. */
const QUEUE_FETCH_LIMIT = 200;

/** The search box filters every queue kind on the name the card carries. */
function rowProducerName(row: ReviewQueueRow): string {
    if (row.type === 'submission') return row.review.card.producerName;
    if (row.type === 'claim') return row.claim.claimant.displayName;
    return row.card.producerName ?? '';
}

async function jsonBody(c: Context<AppEnvironment>): Promise<unknown> {
    return c.req.json().catch(() => {
        throw Object.assign(new Error('请求体必须是有效 JSON'), { status: 400 });
    });
}

function audit(
    c: Context<AppEnvironment>,
    action: string,
    target: string,
    time: string
) {
    const actor = c.get('backofficeUser')!;
    return {
        username: actor.username,
        producername: actor.producername,
        action,
        target,
        ip: getClientAddress(c),
        time
    };
}

function reviewConflict(c: Context<AppEnvironment>, revision: number): Response {
    return c.json({
        success: false,
        code: 'FUDABA_CARD_REVIEW_CONFLICT',
        revision
    }, 409);
}

export async function handleListFudabaRegisteredCardReviews(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const cards = await fudabaRepository(c).listAdminPendingCards(100);
        return c.json({
            items: cards.map(fudabaRegisteredCardReviewView)
        } satisfies FudabaRegisteredCardReviewListResponse);
    } catch (error) {
        console.error('Failed to list registered card reviews', error);
        return c.json({
            success: false,
            code: 'FUDABA_CARD_REVIEW_LIST_FAILED',
            message: '注册名片审核列表加载失败'
        }, 500);
    }
}

export async function handleReviewFudabaRegisteredCard(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    if (!validFudabaCardId(cardId)) {
        return c.json({ success: false, code: 'FUDABA_CARD_REVIEW_NOT_FOUND' }, 404);
    }
    const repository = fudabaRepository(c);
    let approvingRevision: number | null = null;
    let mediaNeedsProtection = false;
    let reviewMediaKeys: string[] = [];
    let requestedDecision: 'approve' | 'reject' | 'flag' | null = null;
    let completionAttempted = false;
    try {
        const review = parseCardReview(await jsonBody(c));
        requestedDecision = review.decision;
        const claimed = await repository.beginRegisteredCardReview(
            cardId,
            review.expectedRevision
        );
        if (claimed.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_CARD_REVIEW_NOT_FOUND' }, 404);
        }
        if (claimed.status === 'conflict') return reviewConflict(c, claimed.revision);
        approvingRevision = claimed.card.revision;
        // A single-sided card has no back media to protect or publish.
        reviewMediaKeys = [
            claimed.card.front_object_key,
            claimed.card.back_object_key
        ].filter((key): key is string => typeof key === 'string' && key.length > 0);
        if (review.decision === 'approve') {
            const storage = services(c).storage;
            if (!storage?.publish || !storage.protect) {
                throw new Error('Reversible object publication unavailable');
            }
            mediaNeedsProtection = true;
            await Promise.all(reviewMediaKeys.map((key) => storage.publish!(key)));
        }
        const reviewedAt = new Date().toISOString();
        completionAttempted = true;
        const result = await repository.completeRegisteredCardReview({
            cardId,
            approvingRevision,
            decision:
                review.decision === 'approve'
                    ? 'publish'
                    : review.decision === 'flag'
                      ? 'flag'
                      : 'reject',
            note: review.note || null,
            reviewedAt,
            audit: audit(
                c,
                review.decision === 'approve'
                    ? '通过注册名片审核'
                    : review.decision === 'flag'
                      ? '标记违规注册名片'
                      : '拒绝注册名片审核',
                `${cardId}@${approvingRevision}${review.note ? ` ${review.note}` : ''}`,
                reviewedAt
            )
        });
        completionAttempted = false;
        if (result.status === 'unavailable' || result.status === 'conflict') {
            if (mediaNeedsProtection) {
                await Promise.all(reviewMediaKeys.map((key) =>
                    protectObjectWithCompensation(services(c), key)
                ));
                mediaNeedsProtection = false;
            }
            await repository.rollbackRegisteredCardReview(cardId, approvingRevision);
            approvingRevision = null;
            if (result.status === 'conflict') {
                return reviewConflict(c, result.revision);
            }
            return c.json({ success: false, code: 'FUDABA_CARD_REVIEW_NOT_FOUND' }, 404);
        }
        mediaNeedsProtection = false;
        approvingRevision = null;
        return c.json({ success: true, revision: result.card.revision });
    } catch (error) {
        let compensationSafe = true;
        if (completionAttempted && approvingRevision !== null && requestedDecision) {
            try {
                const recovered = await repository.findRegisteredCardForAdmin(cardId);
                const expectedStatus = requestedDecision === 'approve'
                    ? 'published'
                    : 'rejected';
                if (
                    recovered?.publication_status === expectedStatus &&
                    recovered.revision === approvingRevision + 1
                ) {
                    return c.json({ success: true, revision: recovered.revision });
                }
            } catch (recoveryError) {
                compensationSafe = false;
                console.error(
                    'Unable to reconcile an uncertain registered card review',
                    recoveryError
                );
            }
        }
        let protectionFailed = false;
        if (compensationSafe && mediaNeedsProtection) {
            await Promise.all(reviewMediaKeys.map((key) =>
                protectObjectWithCompensation(services(c), key)
                    .catch((protectionError) => {
                        protectionFailed = true;
                        console.error('Failed to protect registered card media', protectionError);
                    })
            ));
        }
        if (approvingRevision !== null && compensationSafe && !protectionFailed) {
            await repository.rollbackRegisteredCardReview(cardId, approvingRevision)
                .catch((rollbackError) => {
                    console.error('Failed to roll back registered card review', rollbackError);
                });
        }
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to review registered card', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_CARD_REVIEW_FAILED' : 'FUDABA_CARD_REVIEW_INVALID',
            message: status >= 500 ? '注册名片审核失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}

export async function handleServeFudabaRegisteredCardReviewMedia(
    c: Context<AppEnvironment>
): Promise<Response> {
    const cardId = c.req.param('cardId') || '';
    const side = c.req.param('side') || '';
    if (!validFudabaCardId(cardId) || !['front', 'back'].includes(side)) {
        return c.text('Not Found', 404);
    }
    const card = await fudabaRepository(c).findRegisteredCardForAdmin(cardId);
    if (!card) return c.text('Not Found', 404);
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    // Reviewers have to see the submitted artwork, so a staged revision wins
    // over the published copy; an untouched side keeps serving the live file.
    const key =
        side === 'front'
            ? (card.pending_front_object_key ?? card.front_object_key)
            : (card.pending_back_object_key ?? card.back_object_key);
    if (!key) return c.text('Not Found', 404);
    const response = await objectReadResponse(c.req.raw, storage, key, {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization, Cookie'
    });
    return response ?? c.text('Not Found', 404);
}

export async function handleListFudabaCardSupplements(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const supplements = await fudabaRepository(c).listAdminPendingSupplements(100);
        return c.json({
            items: supplements.map(fudabaCardSupplementView)
        } satisfies SupplementListResponse);
    } catch (error) {
        console.error('Failed to list card supplements', error);
        return c.json({
            success: false,
            code: 'FUDABA_CARD_SUPPLEMENT_LIST_FAILED',
            message: '资料补充审核列表加载失败'
        }, 500);
    }
}

export async function handleGetFudabaCardSupplement(
    c: Context<AppEnvironment>
): Promise<Response> {
    const supplementId = c.req.param('supplementId') || '';
    if (!validFudabaCardId(supplementId)) {
        return c.json({ success: false, code: 'FUDABA_CARD_SUPPLEMENT_NOT_FOUND' }, 404);
    }
    try {
        const found = await fudabaRepository(c).findCardSupplement(supplementId);
        if (!found) {
            return c.json({ success: false, code: 'FUDABA_CARD_SUPPLEMENT_NOT_FOUND' }, 404);
        }
        return c.json({
            success: true,
            supplement: fudabaCardSupplementView(found.supplement),
            live: {
                producerName: found.live.producer_name,
                groupName: found.live.group_name,
                seriesCodes: found.live.series_codes,
                favoriteCharacters: found.live.favorite_characters.map(
                    (character) => ({
                        id: character.character_id,
                        name: character.name_cn
                    })
                )
            }
        } satisfies AdminCardSupplementDetailResponse);
    } catch (error) {
        console.error('Failed to read card supplement', error);
        return c.json({
            success: false,
            code: 'FUDABA_CARD_SUPPLEMENT_READ_FAILED',
            message: '资料补充加载失败'
        }, 500);
    }
}

export async function handleReviewFudabaCardSupplement(
    c: Context<AppEnvironment>
): Promise<Response> {
    const supplementId = c.req.param('supplementId') || '';
    if (!validFudabaCardId(supplementId)) {
        return c.json({ success: false, code: 'FUDABA_CARD_SUPPLEMENT_NOT_FOUND' }, 404);
    }
    try {
        const body = parseCardSupplementReview(await jsonBody(c));
        const now = new Date().toISOString();
        const actor = c.get('backofficeUser')!;
        const result = await fudabaRepository(c).completeCardSupplementReview({
            supplementId,
            decision: body.decision,
            expectedRevision: body.expectedRevision,
            reviewNote: body.note,
            reviewedAt: now,
            reviewedBy: actor.id,
            audit: audit(
                c,
                body.decision === 'approve' ? 'approve-card-supplement' : 'reject-card-supplement',
                `card-supplement:${supplementId}`,
                now
            ),
            contributionId: crypto.randomUUID(),
            contributionPoints: body.decision === 'approve' ? 1 : 0
        });
        if (result.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_CARD_SUPPLEMENT_NOT_FOUND' }, 404);
        }
        if (result.status === 'conflict') {
            return c.json({
                success: false,
                code: 'FUDABA_CARD_SUPPLEMENT_CONFLICT',
                revision: result.revision,
                state: result.state
            } satisfies FudabaCardClaimError, 409);
        }
        return c.json({
            success: true,
            supplement: fudabaCardSupplementView(result.supplement)
        } satisfies SupplementMutationResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to review card supplement', error);
        return c.json({
            success: false,
            code: status >= 500
                ? 'FUDABA_CARD_SUPPLEMENT_REVIEW_FAILED'
                : 'FUDABA_CARD_SUPPLEMENT_REVIEW_INVALID',
            message: status >= 500 ? '资料补充审核失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}

export async function handleListFudabaReviewQueue(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const { type, query, page, pageSize } = parseReviewQueueQuery(c.req.query());
        const repository = fudabaRepository(c);
        const rows: ReviewQueueRow[] = [];
        if (type === null || type === 'submission') {
            for (const card of await repository.listAdminPendingCards(QUEUE_FETCH_LIMIT)) {
                rows.push({
                    type: 'submission',
                    submittedAt: card.review_submitted_at ?? card.created_at,
                    review: fudabaRegisteredCardReviewView(card)
                });
            }
        }
        if (type === null || type === 'claim' || type === 'all') {
            const storage = services(c).storage;
            for (const claim of await repository.listAdminPendingClaims(QUEUE_FETCH_LIMIT)) {
                const view = fudabaAdminCardClaimView(claim);
                rows.push({
                    type: 'claim',
                    submittedAt: claim.created_at,
                    claim: {
                        ...view,
                        // The claim still stores the legacy object keys; the
                        // admin console needs deliverable URLs.
                        legacyCard: {
                            id: view.legacyCard.id,
                            frontImageUrl: await legacyMediaUrl(
                                storage,
                                view.legacyCard.frontImageUrl,
                                view.legacyCard.id,
                                'front'
                            ),
                            backImageUrl: await legacyMediaUrl(
                                storage,
                                view.legacyCard.backImageUrl,
                                view.legacyCard.id,
                                'back'
                            )
                        }
                    }
                });
            }
        }
        if (type === null || type === 'supplement' || type === 'all') {
            for (const supplement of await repository.listAdminPendingSupplements(QUEUE_FETCH_LIMIT)) {
                rows.push({
                    type: 'supplement',
                    submittedAt: supplement.created_at,
                    card: {
                        id: supplement.card_id,
                        cardNumber: supplement.card_number,
                        producerName: supplement.card_producer_name,
                        frontImageUrl: adminNamecardMediaPath(
                            supplement.card_id,
                            'live',
                            'front'
                        ),
                        pageCount: supplement.card_page_count
                    },
                    supplement: fudabaCardSupplementView(supplement)
                });
            }
        }
        // One queue, oldest first: the review desk works top to bottom.
        rows.sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
        const needle = query.toLocaleLowerCase();
        const matched = needle
            ? rows.filter((row) => rowProducerName(row).toLocaleLowerCase().includes(needle))
            : rows;
        const start = (page - 1) * pageSize;
        const total = matched.length;
        return c.json({
            success: true,
            data: matched.slice(start, start + pageSize),
            pageInfo: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
                hasNextPage: start + pageSize < total
            }
        } satisfies ReviewQueueListResponse);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to list the review queue', error);
        return c.json({
            success: false,
            code: status >= 500
                ? 'FUDABA_REVIEW_QUEUE_FAILED'
                : 'FUDABA_REVIEW_QUEUE_INVALID',
            message: status >= 500 ? '审核队列加载失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}

export async function handleListFudabaCardClaimReviews(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const claims = await fudabaRepository(c).listAdminPendingClaims(100);
        return c.json({
            items: claims.map(fudabaAdminCardClaimView)
        } satisfies FudabaAdminCardClaimListResponse);
    } catch (error) {
        console.error('Failed to list card claim reviews', error);
        return c.json({
            success: false,
            code: 'FUDABA_CARD_CLAIM_REVIEW_LIST_FAILED',
            message: '旧名片认领审核列表加载失败'
        }, 500);
    }
}

async function copyLegacyMedia(
    storage: ObjectStorage,
    claim: FudabaAdminCardClaimRecord,
    cardId: string,
    created: CreatedObject[]
): Promise<void> {
    const sourceKeys = [
        namecardMediaObjectKeys(claim.legacy_image1_url)[0],
        namecardMediaObjectKeys(claim.legacy_image2_url)[0]
    ];
    const destinationKeys = [
        namecardClaimMediaObjectKey(sourceKeys[0]!, cardId, 'front'),
        namecardClaimMediaObjectKey(sourceKeys[1]!, cardId, 'back')
    ];
    for (let index = 0; index < sourceKeys.length; index += 1) {
        const source = await storage.get(sourceKeys[index]!);
        if (!source) throw new Error('Legacy namecard media is unavailable');
        const ownerToken = randomHex(32);
        const key = destinationKeys[index]!;
        created.push({ key, ownerToken });
        await storage.put(key, source.body, {
            contentType: source.contentType,
            protectedAccess: true,
            ownerToken,
            metadata: {
                kind: 'fudaba-card-image',
                side: index === 0 ? 'front' : 'back',
                account: claim.claimant_account_id,
                legacyCardId: String(claim.legacy_card_id)
            }
        });
    }
}

export async function handleReviewFudabaCardClaim(
    c: Context<AppEnvironment>
): Promise<Response> {
    const claimId = c.req.param('claimId') || '';
    if (!validFudabaCardId(claimId)) {
        return c.json({ success: false, code: 'FUDABA_CARD_CLAIM_NOT_FOUND' }, 404);
    }
    const repository = fudabaRepository(c);
    let approvingRevision: number | null = null;
    let created: CreatedObject[] = [];
    let createdCardId: string | null = null;
    let requestedDecision: 'approve' | 'reject' | 'flag' | null = null;
    let completionAttempted = false;
    try {
        const review = parseCardReview(await jsonBody(c));
        // A claim is either granted or not; the rule-breaking verdict only
        // applies to card submissions.
        if (review.decision === 'flag') {
            return c.json({ success: false, code: 'FUDABA_CARD_CLAIM_REVIEW_INVALID' }, 400);
        }
        requestedDecision = review.decision;
        const context = await repository.findAdminCardClaim(claimId);
        if (!context) {
            return c.json({ success: false, code: 'FUDABA_CARD_CLAIM_NOT_FOUND' }, 404);
        }
        const claimed = await repository.beginCardClaimReview(
            claimId,
            review.expectedRevision
        );
        if (claimed.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_CARD_CLAIM_NOT_FOUND' }, 404);
        }
        if (claimed.status === 'conflict') return reviewConflict(c, claimed.revision);
        approvingRevision = claimed.claim.revision;
        const reviewedAt = new Date().toISOString();
        const base = {
            claimId,
            approvingRevision,
            reviewedBy: c.get('backofficeUser')!.id,
            reviewedAt,
            reviewNote: review.note,
            notificationTitle: review.decision === 'approve' ? '旧名片认领已通过' : '旧名片认领未通过',
            notificationBody: review.decision === 'approve'
                ? '旧名片已绑定到您的账号。'
                : `管理员未通过本次认领。${review.note}`,
            audit: audit(
                c,
                review.decision === 'approve' ? '通过旧名片认领' : '拒绝旧名片认领',
                `${claimId}@${approvingRevision}`,
                reviewedAt
            )
        };
        let result;
        if (review.decision === 'reject') {
            completionAttempted = true;
            result = await repository.completeCardClaimReview({
                ...base,
                decision: 'reject'
            });
        } else if (context.target_card_id) {
            completionAttempted = true;
            result = await repository.completeCardClaimReview({
                ...base,
                decision: 'approve',
                media: null
            });
        } else {
            const storage = services(c).storage;
            if (!storage?.publish) throw new Error('Object publication unavailable');
            // The legacy card is already the ownerless fudaba_cards row, so
            // the review upgrades it in place; only the artwork has to move
            // to owner-owned objects because the owner media route serves
            // protected keys.
            const boundCardId = `legacy-${context.legacy_card_id}`;
            await copyLegacyMedia(storage, context, boundCardId, created);
            await Promise.all(created.map(({ key }) => storage.publish!(key)));
            completionAttempted = true;
            result = await repository.completeCardClaimReview({
                ...base,
                decision: 'approve',
                media: {
                    frontObjectKey: created[0]!.key,
                    backObjectKey: created[1]?.key ?? null,
                    accent: null
                }
            });
        }
        completionAttempted = false;
        if (result.status === 'unavailable') {
            throw Object.assign(new Error('认领目标不可用'), { status: 409 });
        }
        if (result.status === 'conflict') {
            if (created.length) {
                await Promise.all(created.map(({ key, ownerToken }) =>
                    deleteOwnedObjectWithCompensation(services(c), key, ownerToken)
                ));
                created = [];
            }
            await repository.rollbackCardClaimReview(claimId, approvingRevision);
            approvingRevision = null;
            return reviewConflict(c, result.revision);
        }
        approvingRevision = null;
        created = [];
        return c.json({ success: true, revision: result.claim.revision });
    } catch (error) {
        let compensationSafe = true;
        if (completionAttempted && approvingRevision !== null && requestedDecision) {
            try {
                const recoveredClaim = await repository.findAdminCardClaim(claimId);
                const expectedState = requestedDecision === 'approve'
                    ? 'approved'
                    : 'rejected';
                if (
                    recoveredClaim?.state === expectedState &&
                    recoveredClaim.revision === approvingRevision + 1
                ) {
                    if (createdCardId) {
                        const recoveredCard = await repository.findCardById(createdCardId);
                        if (!recoveredCard || recoveredCard.legacy_card_id !== recoveredClaim.legacy_card_id) {
                            throw new Error('Approved claim card could not be reconciled');
                        }
                    }
                    created = [];
                    return c.json({ success: true, revision: recoveredClaim.revision });
                }
            } catch (recoveryError) {
                compensationSafe = false;
                console.error('Unable to reconcile an uncertain card claim review', recoveryError);
            }
        }
        if (compensationSafe && created.length) {
            await Promise.all(created.map(({ key, ownerToken }) =>
                deleteOwnedObjectWithCompensation(services(c), key, ownerToken)
                    .catch(() => undefined)
            ));
        }
        if (approvingRevision !== null && compensationSafe) {
            await repository.rollbackCardClaimReview(claimId, approvingRevision)
                .catch((rollbackError) => {
                    console.error('Failed to roll back card claim review', rollbackError);
                });
        }
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to review card claim', error);
        return c.json({
            success: false,
            code: status >= 500
                ? 'FUDABA_CARD_CLAIM_REVIEW_FAILED'
                : 'FUDABA_CARD_CLAIM_REVIEW_INVALID',
            message: status >= 500 ? '旧名片认领审核失败' : messageFromError(error)
        }, status as 400 | 409 | 500);
    }
}
