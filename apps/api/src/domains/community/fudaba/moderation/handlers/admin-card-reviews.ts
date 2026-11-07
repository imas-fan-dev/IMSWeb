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
import type {
    FudabaAdminCardClaimRecord,
    FudabaCardPageWrite
} from '@/ports/repositories';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { objectReadResponse } from '@/utils/http/object-read-response';
import {
    fudabaCardMediaVersionObjectKey,
    namecardClaimMediaObjectKey,
    namecardMediaObjectKeys
} from '@/utils/storage/business-object-keys';
import { storeCardPage } from '@/domains/community/fudaba/cards/artwork-store';
import { cardArtworkView } from '@/domains/community/fudaba/cards/artwork-view';
import { parseCardPageObjectKey } from '@/utils/storage/business-object-keys';
import { randomUUID } from 'node:crypto';
import {
    deleteOwnedObjectWithCompensation,
    protectObjectWithCompensation
} from '@/utils/storage/delete-object';

interface CreatedObject {
    key: string;
    ownerToken: string;
}

/**
 * 审核通过时按圈数重写一张图：读原对象、转好、写成新版本页面对象。
 * 圈数为 0 时不写任何对象，原 key 原样返回。
 */
async function rotateReviewedArtwork(
    runtime: ReturnType<typeof services>,
    input: {
        cardId: string;
        side: 'front' | 'back';
        key: string;
        turns: number;
        accountId: string;
    },
    created: CreatedObject[],
    pages: FudabaCardPageWrite[]
): Promise<string> {
    const turn = ((input.turns % 4) + 4) % 4;
    if (turn === 0) return input.key;
    const storage = runtime.storage;
    if (!storage || !runtime.images?.rotate || !runtime.images.validate) {
        throw new Error('Image rotation is unavailable');
    }
    const object = await storage.get(input.key);
    if (!object) throw new Error('Artwork image is unavailable');
    const rotated = await runtime.images.rotate(object.body, turn * 90);
    const info = await runtime.images.validate(rotated, 'image/webp');
    const stored = await storeCardPage(runtime, {
        cardId: input.cardId,
        queue: 'live',
        pageId:
            parseCardPageObjectKey(input.key)?.pageId ??
            `page-${randomUUID()}`,
        body: rotated,
        width: info.width,
        height: info.height,
        accountId: input.accountId
    });
    created.push({ key: stored.key, ownerToken: randomHex(32) });
    pages.push({
        pageId: stored.pageId,
        objectVersion: stored.version,
        width: stored.width,
        height: stored.height
    });
    return stored.key;
}

/** 旧卡片的媒体统一走后台路由；key 只用于判断该面是否存在。 */
function legacyMediaUrl(
    key: string | null,
    legacyCardId: number,
    side: 'front' | 'back'
): string | null {
    return key ? adminNamecardMediaPath(legacyCardId, 'live', side) : null;
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
        /*
          公开墙按「公开对象」取图，所以这里必须发布批准之后真正上线的那一套：
          有暂存图片时是待审那套（正反面缺省回落到线上，与 publishStagedRevision
          一致），否则就是线上那套。只发布线上会漏掉新版本，墙整页取图失败。
        */
        const stagedArtwork =
            claimed.card.pending_front_object_key !== null ||
            claimed.card.pending_back_object_key !== null ||
            claimed.card.pending_middle_object_keys.length > 0;
        const nextMiddleKeys = stagedArtwork
            ? claimed.card.pending_middle_object_keys.length > 0
                ? claimed.card.pending_middle_object_keys
                : claimed.card.middle_object_keys
            : claimed.card.middle_object_keys;
        reviewMediaKeys = (
            stagedArtwork
                ? [
                      claimed.card.pending_front_object_key ??
                          claimed.card.front_object_key,
                      ...nextMiddleKeys,
                      claimed.card.pending_back_object_key ??
                          claimed.card.back_object_key
                  ]
                : [
                      claimed.card.front_object_key,
                      ...nextMiddleKeys,
                      claimed.card.back_object_key
                  ]
        ).filter((key): key is string => typeof key === 'string' && key.length > 0);
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
        const repository = fudabaRepository(c);
        // 补充只可能带正反面旋转：批准前把线上对象转好，再连同字段一起写。
        let media: {
            frontObjectKey: string;
            backObjectKey: string | null;
            accent: null;
            pages?: FudabaCardPageWrite[];
        } | null = null;
        let rotatedArtwork: CreatedObject[] = [];
        if (body.decision === 'approve') {
            const pending = await repository.findCardSupplement(supplementId);
            const rotations = pending?.supplement.payload.rotations ?? {};
            const turnFront = rotations.front ?? 0;
            const turnBack = rotations.back ?? 0;
            if (pending && (turnFront !== 0 || turnBack !== 0)) {
                const runtime = services(c);
                const created: CreatedObject[] = [];
                const pages: FudabaCardPageWrite[] = [];
                rotatedArtwork = created;
                try {
                    media = {
                        frontObjectKey: await rotateReviewedArtwork(
                            runtime,
                            {
                                cardId: pending.live.id,
                                side: 'front',
                                key: pending.live.front_object_key,
                                turns: turnFront,
                                accountId: pending.supplement.submitter_account_id
                            },
                            created,
                            pages
                        ),
                        backObjectKey: pending.live.back_object_key
                            ? await rotateReviewedArtwork(
                                  runtime,
                                  {
                                      cardId: pending.live.id,
                                      side: 'back',
                                      key: pending.live.back_object_key,
                                      turns: turnBack,
                                      accountId: pending.supplement.submitter_account_id
                                  },
                                  created,
                                  pages
                              )
                            : null,
                        accent: null,
                        pages
                    };
                } catch (rotationError) {
                    await Promise.all(created.map(({ key, ownerToken }) =>
                        deleteOwnedObjectWithCompensation(services(c), key, ownerToken)
                            .catch(() => undefined)
                    ));
                    throw rotationError;
                }
            }
        }
        // 补充面向的是已上墙的卡：批准前先把旋转后的对象发布出去。
        const supplementStorage = services(c).storage;
        if (media && supplementStorage?.publish) {
            await Promise.all(
                rotatedArtwork.map(({ key }) => supplementStorage.publish!(key))
            );
        }
        const result = await repository.completeCardSupplementReview({
            supplementId,
            decision: body.decision,
            expectedRevision: body.expectedRevision,
            media,
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
        const adminPages = async (cardNumber: number) => {
            const map =
                (await repository.listCardPagesBatchByNumbers?.([cardNumber])) ??
                new Map();
            const rowsForCard = map.get(cardNumber);
            return cardArtworkView({
                scope: 'admin',
                cardNumber,
                cardId: String(cardNumber),
                live: rowsForCard?.live ?? [],
                pending: []
            }).live;
        };
        if (type === null || type === 'claim' || type === 'all') {
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
                            frontImageUrl: adminNamecardMediaPath(
                                view.legacyCard.id,
                                'live',
                                'front'
                            ),
                            // 背面缺 key 就是单面名片，不能给一个必 404 的兜底路径。
                            backImageUrl: legacyMediaUrl(
                                view.legacyCard.backImageUrl,
                                view.legacyCard.id,
                                'back'
                            ),
                            ...(await adminPages(view.legacyCard.id).then((pages) =>
                                pages.length > 0 ? { pages } : {}
                            ))
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
                        // The media route addresses cards by number, not by id.
                        frontImageUrl: adminNamecardMediaPath(
                            supplement.card_number,
                            'live',
                            'front'
                        ),
                        middleImageUrls: Array.from(
                            { length: supplement.card_middle_count },
                            (_, index) =>
                                adminNamecardMediaPath(
                                    supplement.card_number,
                                    'live',
                                    `middle-${index + 1}`
                                )
                        ),
                        backImageUrl: supplement.card_has_back
                            ? adminNamecardMediaPath(
                                  supplement.card_number,
                                  'live',
                                  'back'
                              )
                            : null,
                        pageCount: supplement.card_page_count,
                        ...(await adminPages(supplement.card_number).then((pages) =>
                            pages.length > 0 ? { pages } : {}
                        ))
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

/**
 * Legacy rows either keep the object key the importer wrote or the older
 * `/uploads/namecard/original/...` public path; both have to resolve to a key
 * before the artwork can be copied.
 */
function legacyMediaObjectKey(value: string | null): string | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith('/') && !trimmed.startsWith('http')) return trimmed;
    return namecardMediaObjectKeys(trimmed)[0];
}

/** Copies the ownerless row's artwork next to the claimant's card. */
async function copyLegacyMedia(
    storage: ObjectStorage,
    claim: FudabaAdminCardClaimRecord,
    cardId: string,
    created: CreatedObject[]
): Promise<{ frontObjectKey: string; backObjectKey: string | null }> {
    const sources = [
        legacyMediaObjectKey(claim.legacy_image1_url),
        legacyMediaObjectKey(claim.legacy_image2_url)
    ];
    if (!sources[0]) throw new Error('Legacy namecard media is unavailable');
    const keys: string[] = [];
    for (const [index, sourceKey] of sources.entries()) {
        if (!sourceKey) continue;
        const side = index === 0 ? 'front' : 'back';
        const source = await storage.get(sourceKey);
        if (!source) throw new Error('Legacy namecard media is unavailable');
        const ownerToken = randomHex(32);
        const key = namecardClaimMediaObjectKey(sourceKey, cardId, side);
        created.push({ key, ownerToken });
        await storage.put(key, source.body, {
            contentType: source.contentType,
            protectedAccess: true,
            ownerToken,
            metadata: {
                kind: 'fudaba-card-image',
                side,
                account: claim.claimant_account_id,
                legacyCardId: String(claim.legacy_card_id)
            }
        });
        keys.push(key);
    }
    return { frontObjectKey: keys[0]!, backObjectKey: keys[1] ?? null };
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
    const pages: FudabaCardPageWrite[] = [];
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
        const rotations = context.payload.rotations ?? {};
        const turnFront = rotations.front ?? 0;
        const turnBack = rotations.back ?? 0;
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
            // 认领不改图，只可能带着提交时的旋转；没有旋转就保持原图。
            let media: {
                frontObjectKey: string;
                backObjectKey: string | null;
                accent: null;
                pages?: FudabaCardPageWrite[];
            } | null = null;
            if (turnFront !== 0 || turnBack !== 0) {
                const target = await repository.findCardById(context.target_card_id);
                if (!target) throw new Error('认领目标不可用');
                const runtime = services(c);
                media = {
                    frontObjectKey: await rotateReviewedArtwork(
                        runtime,
                        {
                            cardId: target.id,
                            side: 'front',
                            key: target.front_object_key,
                            turns: turnFront,
                            accountId: context.claimant_account_id
                        },
                        created,
                        pages
                    ),
                    backObjectKey: target.back_object_key
                        ? await rotateReviewedArtwork(
                              runtime,
                              {
                                  cardId: target.id,
                                  side: 'back',
                                  key: target.back_object_key,
                                  turns: turnBack,
                                  accountId: context.claimant_account_id
                              },
                              created,
                              pages
                          )
                        : null,
                    accent: null,
                    pages
                };
                // 这张卡已经在墙上展示，换了图就要立刻发布，否则整页取图失败。
                const claimStorage = services(c).storage;
                if (claimStorage?.publish) {
                    await Promise.all(created.map(({ key }) => claimStorage.publish!(key)));
                }
            }
            completionAttempted = true;
            result = await repository.completeCardClaimReview({
                ...base,
                decision: 'approve',
                media
            });
        } else {
            const storage = services(c).storage;
            if (!storage?.publish) throw new Error('Object publication unavailable');
            // The legacy card is already the ownerless fudaba_cards row, so
            // the review upgrades it in place; only the artwork has to move
            // to owner-owned objects because the owner media route serves
            // protected keys.
            const boundCardId = `legacy-${context.legacy_card_id}`;
            const copied = await copyLegacyMedia(storage, context, boundCardId, created);
            const media = {
                frontObjectKey: await rotateReviewedArtwork(
                    services(c),
                    {
                        cardId: boundCardId,
                        side: 'front',
                        key: copied.frontObjectKey,
                        turns: turnFront,
                        accountId: context.claimant_account_id
                    },
                    created,
                    pages
                ),
                backObjectKey: copied.backObjectKey
                    ? await rotateReviewedArtwork(
                          services(c),
                          {
                              cardId: boundCardId,
                              side: 'back',
                              key: copied.backObjectKey,
                              turns: turnBack,
                              accountId: context.claimant_account_id
                          },
                          created,
                          pages
                      )
                    : null,
                pages
            };
            await Promise.all(created.map(({ key }) => storage.publish!(key)));
            completionAttempted = true;
            result = await repository.completeCardClaimReview({
                ...base,
                decision: 'approve',
                media: { ...media, accent: null }
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
