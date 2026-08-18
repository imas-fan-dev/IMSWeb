import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parseCardReview } from '@/domains/community/fudaba/moderation/request';
import { fudabaAdminCardClaimView, fudabaRegisteredCardReviewView } from '@/domains/community/fudaba/moderation/response';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import {
    fudabaRepository,
    getClientAddress,
    services
} from '@/middleware/hono-context';
import type { ObjectStorage } from '@/ports/object-storage';
import type { FudabaAdminCardClaimRecord } from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { objectReadResponse } from '@/utils/http/object-read-response';
import {
    fudabaCardBackObjectKey,
    fudabaCardFrontObjectKey,
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
        return c.json({ items: cards.map(fudabaRegisteredCardReviewView) });
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
    let requestedDecision: 'approve' | 'reject' | null = null;
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
        reviewMediaKeys = [
            claimed.card.front_object_key,
            claimed.card.back_object_key
        ];
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
            decision: review.decision === 'approve' ? 'publish' : 'reject',
            reviewedAt,
            audit: audit(
                c,
                review.decision === 'approve' ? '通过注册名片审核' : '拒绝注册名片审核',
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
            mediaNeedsProtection = false;
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
    const key = side === 'front' ? card.front_object_key : card.back_object_key;
    const response = await objectReadResponse(c.req.raw, storage, key, {
        'Cache-Control': 'private, no-store',
        'Vary': 'Authorization, Cookie'
    });
    return response ?? c.text('Not Found', 404);
}

export async function handleListFudabaCardClaimReviews(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const claims = await fudabaRepository(c).listAdminPendingClaims(100);
        return c.json({ items: claims.map(fudabaAdminCardClaimView) });
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
        fudabaCardFrontObjectKey(cardId, 'webp'),
        fudabaCardBackObjectKey(cardId, 'webp')
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
    let requestedDecision: 'approve' | 'reject' | null = null;
    let completionAttempted = false;
    try {
        const review = parseCardReview(await jsonBody(c));
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
                target: { kind: 'existing', cardId: context.target_card_id }
            });
        } else {
            const storage = services(c).storage;
            if (!storage?.publish) throw new Error('Object publication unavailable');
            const newCardId = crypto.randomUUID();
            createdCardId = newCardId;
            await copyLegacyMedia(storage, context, newCardId, created);
            await Promise.all(created.map(({ key }) => storage.publish!(key)));
            completionAttempted = true;
            result = await repository.completeCardClaimReview({
                ...base,
                decision: 'approve',
                target: {
                    kind: 'create',
                    card: {
                        id: newCardId,
                        producerName: context.claimant_display_name,
                        displayName: context.claimant_display_name,
                        frontObjectKey: created[0]!.key,
                        backObjectKey: created[1]!.key,
                        accent: '#dc2626',
                        bio: '',
                        tradeNote: '',
                        available: false
                    }
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
