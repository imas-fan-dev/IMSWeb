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
import {
    planNamecardReview,
    type NamecardReviewAction,
    type NamecardReviewPlan
} from '@/ports/repositories/fudaba-review-policy';
import { randomHex } from '@/utils/crypto/random';
import { messageFromError, statusFromError } from '@/utils/http/error-response';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { fudabaCardMediaVersionObjectKey } from '@/utils/storage/business-object-keys';
import { storeCardPage } from '@/domains/community/fudaba/cards/artwork-store';
import { namecardPagesView } from '@/domains/community/fudaba/cards/artwork-view';
import { cardPageObjectKeys } from '@/domains/community/fudaba/cards/card-media-resolver';
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
        side: 'front' | 'back' | 'middle';
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
    const ownerToken = randomHex(32);
    const stored = await storeCardPage(runtime, {
        cardId: input.cardId,
        queue: 'live',
        pageId:
            parseCardPageObjectKey(input.key)?.pageId ??
            `page-${randomUUID()}`,
        body: rotated,
        width: info.width,
        height: info.height,
        accountId: input.accountId,
        ownerToken,
        onBeforePut: (key) => created.push({ key, ownerToken })
    });
    pages.push({
        pageId: stored.pageId,
        objectVersion: stored.version,
        width: stored.width,
        height: stored.height
    });
    return stored.key;
}

/**
 * 按页序重写中间页：只转圈数非 0 的那几张，其余原样保留在返回的页序里。
 * 返回的是**完整的**中间页键序列——仓储同步页面行时用它判断哪些页还在，
 * 只交被旋转的那几张会把其余中间页当成已删除。
 */
async function rotateReviewedMiddles(
    runtime: ReturnType<typeof services>,
    input: {
        cardId: string;
        /** 线上页面行：首页正面、末页背面，中间的 1..n-2 是中间页。 */
        liveKeys: readonly string[];
        /** 按页序排列的中间页圈数；下标 0 对应第一张中间页。 */
        turns: readonly number[];
        accountId: string;
    },
    created: CreatedObject[],
    pages: FudabaCardPageWrite[]
): Promise<string[]> {
    const middles = input.liveKeys.slice(
        1,
        Math.max(1, input.liveKeys.length - 1)
    );
    for (const [index, turns] of input.turns.entries()) {
        const slot = index + 1;
        if (turns === 0 || slot >= input.liveKeys.length - 1) continue;
        middles[index] = await rotateReviewedArtwork(
            runtime,
            {
                cardId: input.cardId,
                side: 'middle',
                key: input.liveKeys[slot]!,
                turns,
                accountId: input.accountId
            },
            created,
            pages
        );
    }
    return middles;
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
        const repository = fudabaRepository(c);
        const cards = await repository.listAdminPendingCards(100);
        const pagesByNumber =
            (await repository.listCardPagesBatchByNumbers?.(
                cards.map((card) => Number(card.card_number))
            )) ?? new Map();
        return c.json({
            items: cards.map((card) => {
                const rows = pagesByNumber.get(Number(card.card_number));
                return fudabaRegisteredCardReviewView(
                    card,
                    namecardPagesView(rows, {
                        scope: 'admin',
                        cardNumber: Number(card.card_number),
                        cardId: card.id
                    }).live
                );
            })
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
    /** 认领后由共享状态机算出的落点；失败恢复靠它判断判决有没有落地。 */
    let reviewPlan: NamecardReviewPlan | null = null;
    let completionAttempted = false;
    try {
        const review = parseCardReview(await jsonBody(c));
        const action: NamecardReviewAction = review.decision === 'approve'
            ? 'publish'
            : review.decision === 'flag'
              ? 'flag'
              : 'reject';
        const claimed = await repository.beginRegisteredCardReview(
            cardId,
            review.expectedRevision
        );
        if (claimed.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_CARD_REVIEW_NOT_FOUND' }, 404);
        }
        if (claimed.status === 'conflict') return reviewConflict(c, claimed.revision);
        approvingRevision = claimed.card.revision;
        // 判决的落点由共享状态机给出：只有 `publish` 才提升待审页与整份改版。
        reviewPlan = planNamecardReview(
            {
                publicationStatus: claimed.card.publication_status,
                reviewStatus: claimed.card.review_status
            },
            action
        );
        /*
          公开墙按「公开对象」取图，所以这里必须发布批准之后真正上线的那一套：
          有暂存页面行时是完整的待审快照（未改动的页仍指向线上对象），否则就是
          线上那套。只发布线上会漏掉新版本，墙整页取图失败。
        */
        reviewMediaKeys =
            claimed.card.pending_pages.length > 0
                ? cardPageObjectKeys(
                      claimed.card.id,
                      'pending',
                      claimed.card.pending_pages
                  )
                : cardPageObjectKeys(claimed.card.id, 'live', claimed.card.pages);
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
            decision: action,
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
            }
            // 判决没落地也不回收认领：行留在 `approving`（或待审改版）等重试——
            // 这是 P1 一直以来的语义，重试时 `begin*` 会以 `resumed` 续做。
            if (result.status === 'conflict') {
                return reviewConflict(c, result.revision);
            }
            return c.json({ success: false, code: 'FUDABA_CARD_REVIEW_NOT_FOUND' }, 404);
        }
        return c.json({ success: true, revision: result.card.revision });
    } catch (error) {
        let compensationSafe = true;
        if (completionAttempted && approvingRevision !== null && reviewPlan && reviewPlan.allowed) {
            // 落点已知，所以「这次判决到底有没有落地」是可判定的：行必须推进到状态
            // 机给出的那两列上。`pending` 回滚已经不存在，这是唯一的恢复判据。
            try {
                const recovered = await repository.findRegisteredCardForAdmin(cardId);
                if (
                    recovered &&
                    recovered.revision === approvingRevision + 1 &&
                    recovered.publication_status === reviewPlan.publicationStatus &&
                    recovered.review_status === reviewPlan.reviewStatus
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
        if (compensationSafe && mediaNeedsProtection) {
            // 只是把这次发布退回受保护状态；认领本身照旧留着等重试。
            await Promise.all(reviewMediaKeys.map((key) =>
                protectObjectWithCompensation(services(c), key)
                    .catch((protectionError) => {
                        console.error(
                            'Failed to protect registered card media',
                            protectionError
                        );
                    })
            ));
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
            middleObjectKeys: string[];
            accent: null;
            pages?: FudabaCardPageWrite[];
        } | null = null;
        let rotatedArtwork: CreatedObject[] = [];
        if (body.decision === 'approve') {
            const pending = await repository.findCardSupplement(supplementId);
            const rotations = pending?.supplement.payload.rotations ?? {};
            const turnFront = rotations.front ?? 0;
            const turnBack = rotations.back ?? 0;
            const middleTurns = rotations.middles ?? [];
            if (
                pending &&
                (turnFront !== 0 ||
                    turnBack !== 0 ||
                    middleTurns.some((turns) => turns !== 0))
            ) {
                const runtime = services(c);
                const created: CreatedObject[] = [];
                const pages: FudabaCardPageWrite[] = [];
                rotatedArtwork = created;
                // 线上页面行是唯一来源：首页正面、末页背面，中间的 1..n-2 是中间页。
                const liveKeys = cardPageObjectKeys(
                    pending.live.id,
                    'live',
                    pending.live.pages
                );
                try {
                    media = {
                        frontObjectKey: await rotateReviewedArtwork(
                            runtime,
                            {
                                cardId: pending.live.id,
                                side: 'front',
                                key: liveKeys[0]!,
                                turns: turnFront,
                                accountId: pending.supplement.submitter_account_id
                            },
                            created,
                            pages
                        ),
                        backObjectKey:
                            liveKeys.length > 1
                                ? await rotateReviewedArtwork(
                                      runtime,
                                      {
                                          cardId: pending.live.id,
                                          side: 'back',
                                          key: liveKeys[liveKeys.length - 1]!,
                                          turns: turnBack,
                                          accountId: pending.supplement.submitter_account_id
                                      },
                                      created,
                                      pages
                                  )
                                : null,
                        middleObjectKeys: await rotateReviewedMiddles(
                            runtime,
                            {
                                cardId: pending.live.id,
                                liveKeys,
                                turns: middleTurns,
                                accountId: pending.supplement.submitter_account_id
                            },
                            created,
                            pages
                        ),
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
            return namecardPagesView(rowsForCard, {
                scope: 'admin',
                cardNumber,
                cardId: String(cardNumber)
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
                        // 老卡预览统一走页面行（后台作用域），正/反由页序推导。
                        legacyCard: {
                            id: view.legacyCard.id,
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

/** Copies the ownerless row's artwork into unified live page objects. */
async function copyLegacyMedia(
    runtime: ReturnType<typeof services>,
    claim: FudabaAdminCardClaimRecord,
    cardId: string,
    turns: { front: number; back: number },
    created: CreatedObject[],
    pages: FudabaCardPageWrite[],
): Promise<{ frontObjectKey: string; backObjectKey: string | null }> {
    const storage = runtime.storage;
    const images = runtime.images;
    if (!storage) throw new Error('Object storage is unavailable');
    if (!images?.validate) throw new Error('Image validation is unavailable');
    // The claim row lists the guest card's live page keys, so the sources are
    // already object keys.
    const sources = [
        claim.legacy_front_key.trim() || null,
        claim.legacy_back_key?.trim() || null,
    ];
    if (!sources[0]) throw new Error('Legacy namecard media is unavailable');
    let frontObjectKey: string | null = null;
    let backObjectKey: string | null = null;
    for (const [index, sourceKey] of sources.entries()) {
        if (!sourceKey) continue;
        const side = index === 0 ? 'front' : 'back';
        const source = await storage.get(sourceKey);
        if (!source) throw new Error('Legacy namecard media is unavailable');
        let body = source.body;
        const turn = (((turns[side] % 4) + 4) % 4);
        if (turn > 0) {
            if (!images.rotate) throw new Error('Image rotation is unavailable');
            body = await images.rotate(body, turn * 90);
        }
        const info = await images.validate(body, 'image/webp');
        const ownerToken = randomHex(32);
        const stored = await storeCardPage(runtime, {
            cardId,
            queue: 'live',
            pageId: side,
            body,
            width: info.width,
            height: info.height,
            accountId: claim.claimant_account_id,
            ownerToken,
            onBeforePut: (key) => created.push({ key, ownerToken }),
        });
        pages.push({
            pageId: stored.pageId,
            objectVersion: stored.version,
            width: stored.width,
            height: stored.height,
        });
        if (side === 'front') frontObjectKey = stored.key;
        else backObjectKey = stored.key;
    }
    if (!frontObjectKey) throw new Error('Legacy namecard media is unavailable');
    return { frontObjectKey, backObjectKey };
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
        const middleTurns = rotations.middles ?? [];
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
                middleObjectKeys: string[];
                accent: null;
                pages?: FudabaCardPageWrite[];
            } | null = null;
            if (
                turnFront !== 0 ||
                turnBack !== 0 ||
                middleTurns.some((turns) => turns !== 0)
            ) {
                const target = await repository.findCardById(context.target_card_id);
                if (!target) throw new Error('认领目标不可用');
                const runtime = services(c);
                // 线上页面行是唯一来源：首页正面、末页背面，中间的 1..n-2 是中间页。
                const liveKeys = cardPageObjectKeys(
                    target.id,
                    'live',
                    target.pages
                );
                media = {
                    frontObjectKey: await rotateReviewedArtwork(
                        runtime,
                        {
                            cardId: target.id,
                            side: 'front',
                            key: liveKeys[0]!,
                            turns: turnFront,
                            accountId: context.claimant_account_id
                        },
                        created,
                        pages
                    ),
                    backObjectKey:
                        liveKeys.length > 1
                            ? await rotateReviewedArtwork(
                                  runtime,
                                  {
                                      cardId: target.id,
                                      side: 'back',
                                      key: liveKeys[liveKeys.length - 1]!,
                                      turns: turnBack,
                                      accountId: context.claimant_account_id
                                  },
                                  created,
                                  pages
                              )
                            : null,
                    middleObjectKeys: await rotateReviewedMiddles(
                        runtime,
                        {
                            cardId: target.id,
                            liveKeys,
                            turns: middleTurns,
                            accountId: context.claimant_account_id
                        },
                        created,
                        pages
                    ),
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
            const copied = await copyLegacyMedia(
                services(c),
                context,
                boundCardId,
                { front: turnFront, back: turnBack },
                created,
                pages,
            );
            // 旧名片的中间页已经挂在这一行上，认领不重抄它们：按提交的圈数重写，
            // 未旋转的原样留在页序里，交给仓储一起同步页面行。取不到旧行时只能
            // 维持旧行为（退回只剩正反面）。
            const guest = await repository.findCardById(boundCardId);
            const middleObjectKeys = guest
                ? await rotateReviewedMiddles(
                      services(c),
                      {
                          cardId: boundCardId,
                          liveKeys: cardPageObjectKeys(
                              boundCardId,
                              'live',
                              guest.pages
                          ),
                          turns: middleTurns,
                          accountId: context.claimant_account_id
                      },
                      created,
                      pages
                  )
                : [];
            const media = {
                frontObjectKey: copied.frontObjectKey,
                backObjectKey: copied.backObjectKey,
                middleObjectKeys,
                pages,
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
