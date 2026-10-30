import type {
    // pi-lens-ignore: ts:2305
    FudabaCardClaimError,
    // pi-lens-ignore: ts:2305
    FudabaClaimMutationResponse,
    // pi-lens-ignore: ts:2305
    FudabaOwnerClaimListResponse,
    // pi-lens-ignore: ts:2305
    SupplementMutationResponse
} from '@imsweb/contracts/fudaba/card-claims';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parseCardSupplementPayload, parseLegacyCardClaim, parseLegacyCardId } from '@/domains/community/fudaba/claims/request';
import { fudabaCardSupplementView } from '@/domains/community/fudaba/claims/response';
import { fudabaCardClaimView } from '@/domains/community/fudaba/contracts/claim';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

async function jsonBody(c: Context<AppEnvironment>): Promise<unknown> {
    return c.req.json().catch(() => {
        throw Object.assign(new Error('请求体必须是有效 JSON'), { status: 400 });
    });
}

export async function handleListFudabaOwnerCardClaims(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const claims = await fudabaRepository(c).listCardClaimsForOwner(
            c.get('platformUser')!.id,
            100
        );
        return c.json({
            items: claims.map(fudabaCardClaimView)
        } satisfies FudabaOwnerClaimListResponse);
    } catch (error) {
        console.error('Failed to list owner card claims', error);
        return c.json({
            success: false,
            code: 'FUDABA_CARD_CLAIM_LIST_FAILED',
            message: '名片认领记录加载失败'
        }, 500);
    }
}

export async function handleCreateFudabaCardSupplement(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const cardId = c.req.param('cardId') || '';
        if (!validFudabaCardId(cardId)) {
            return c.json(
                { success: false, code: 'FUDABA_CARD_NOT_FOUND' },
                404
            );
        }
        const payload = parseCardSupplementPayload(await jsonBody(c));
        const now = new Date().toISOString();
        const result = await fudabaRepository(c).createCardSupplementForOwner({
            id: crypto.randomUUID(),
            cardId,
            submitterAccountId: c.get('platformUser')!.id,
            payload,
            createdAt: now,
            updatedAt: now
        });
        if (result.status === 'unchanged') {
            return c.json(
                {
                    success: false,
                    code: 'FUDABA_CARD_SUPPLEMENT_UNCHANGED',
                    message: '补充的资料和现在的名片一致，不用提交'
                },
                409
            );
        }
        if (result.status === 'unavailable') {
            return c.json(
                { success: false, code: 'FUDABA_CARD_SUPPLEMENT_UNAVAILABLE' },
                404
            );
        }
        if (result.status === 'conflict') {
            return c.json(
                {
                    success: false,
                    code: 'FUDABA_CARD_SUPPLEMENT_CONFLICT',
                    supplementId: result.supplementId,
                    state: result.state
                } satisfies FudabaCardClaimError,
                409
            );
        }
        return c.json(
            {
                success: true,
                supplement: fudabaCardSupplementView(result.supplement)
            } satisfies SupplementMutationResponse,
            201
        );
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500)
            console.error('Failed to create card supplement', error);
        return c.json(
            {
                success: false,
                code:
                    status >= 500
                        ? 'FUDABA_CARD_SUPPLEMENT_FAILED'
                        : 'FUDABA_CARD_SUPPLEMENT_INVALID',
                message: status >= 500 ? '资料补充提交失败' : messageFromError(error)
            },
            status as 400 | 500
        );
    }
}

export async function handleCreateFudabaLegacyCardClaim(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const legacyCardId = parseLegacyCardId(c.req.param('legacyCardId') || '');
        const input = parseLegacyCardClaim(await jsonBody(c));
        const now = new Date().toISOString();
        const result = await fudabaRepository(c).createCardClaimForOwner({
            id: crypto.randomUUID(),
            legacyCardId,
            claimantAccountId: c.get('platformUser')!.id,
            targetCardId: input.targetCardId,
            payload: input.payload,
            message: input.message,
            createdAt: now,
            updatedAt: now
        });
        if (result.status === 'series-required') {
            return c.json({
                success: false,
                code: 'FUDABA_CLAIM_SERIES_REQUIRED',
                message: '请选择主企划后再提交认领'
            }, 409);
        }
        if (result.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_LEGACY_CARD_UNAVAILABLE' }, 404);
        }
        if (result.status === 'conflict') {
            return c.json({
                success: false,
                code: 'FUDABA_CARD_CLAIM_CONFLICT',
                claimId: result.claimId,
                state: result.state
            }, 409);
        }
        return c.json({
            success: true,
            claim: fudabaCardClaimView(result.claim)
        } satisfies FudabaClaimMutationResponse, 201);
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to create legacy card claim', error);
        return c.json({
            success: false,
            code: status >= 500 ? 'FUDABA_CARD_CLAIM_FAILED' : 'FUDABA_CARD_CLAIM_INVALID',
            message: status >= 500 ? '名片认领提交失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}
