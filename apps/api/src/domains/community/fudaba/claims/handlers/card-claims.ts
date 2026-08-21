import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { parseEnvelopeAction, parseLegacyCardClaim, parseLegacyCardId } from '@/domains/community/fudaba/claims/request';
import { fudabaClaimEnvelopeView } from '@/domains/community/fudaba/claims/response';
import { fudabaCardClaimView } from '@/domains/community/fudaba/contracts/claim';
import { validFudabaCardId } from '@/domains/community/fudaba/contracts/card';
import { fudabaRepository } from '@/middleware/hono-context';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

async function jsonBody(c: Context<AppEnvironment>): Promise<unknown> {
    return c.req.json().catch(() => {
        throw Object.assign(new Error('请求体必须是有效 JSON'), { status: 400 });
    });
}

function envelopeId(value: string): number | null {
    if (!/^[1-9]\d*$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}

export async function handleListFudabaClaimEnvelopes(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const repository = fudabaRepository(c);
        await repository.ensureSameIdLegacyCardEnvelopes({
            title: '这张旧名片是您的吗？',
            body: '检测到旧名片与您的注册名片 ID 相同。确认后将提交管理员审核，审核通过后才会绑定。',
            createdAt: new Date().toISOString()
        });
        const items = await repository.listClaimEnvelopesForOwner(
            c.get('platformUser')!.id,
            100
        );
        return c.json({ items: items.map(fudabaClaimEnvelopeView) });
    } catch (error) {
        console.error('Failed to list Fudaba claim envelopes', error);
        return c.json({
            success: false,
            code: 'FUDABA_CLAIM_ENVELOPE_LIST_FAILED',
            message: '认领信封加载失败'
        }, 500);
    }
}

export async function handleRespondFudabaClaimEnvelope(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const id = envelopeId(c.req.param('envelopeId') || '');
        if (!id) {
            return c.json({ success: false, code: 'FUDABA_CLAIM_ENVELOPE_NOT_FOUND' }, 404);
        }
        const action = parseEnvelopeAction(await jsonBody(c));
        const repository = fudabaRepository(c);
        const accountId = c.get('platformUser')!.id;
        if (action.decision === 'decline') {
            const result = await repository.actionClaimEnvelope({
                envelopeId: id,
                recipientAccountId: accountId,
                action: 'decline',
                expectedRevision: action.expectedRevision,
                actionedAt: new Date().toISOString()
            });
            if (result.status === 'unavailable') {
                return c.json({ success: false, code: 'FUDABA_CLAIM_ENVELOPE_NOT_FOUND' }, 404);
            }
            if (result.status === 'conflict') {
                return c.json({
                    success: false,
                    code: 'FUDABA_CLAIM_ENVELOPE_CONFLICT',
                    revision: result.revision
                }, 409);
            }
            return c.json({
                success: true,
                envelope: fudabaClaimEnvelopeView(result.envelope),
                claim: null
            });
        }

        const envelopes = await repository.listClaimEnvelopesForOwner(accountId, 100);
        const envelope = envelopes.find((candidate) => candidate.id === id);
        if (!envelope) {
            return c.json({ success: false, code: 'FUDABA_CLAIM_ENVELOPE_NOT_FOUND' }, 404);
        }
        const targetCardId = String(envelope.legacy_card_id);
        const target = validFudabaCardId(targetCardId)
            ? await repository.findCardForOwner(targetCardId, accountId)
            : null;
        if (!target || target.favorite_idols.length < 1) {
            return c.json({ success: false, code: 'FUDABA_CLAIM_TARGET_UNAVAILABLE' }, 409);
        }
        const now = new Date().toISOString();
        const result = await repository.confirmLegacyCardEnvelope({
            id: crypto.randomUUID(),
            envelopeId: id,
            recipientAccountId: accountId,
            targetCardId,
            seriesCode: target.series_code,
            idolIds: target.favorite_idols.map((idol) => idol.idol_id),
            message: '同 ID 旧名片身份确认',
            expectedRevision: action.expectedRevision,
            actionedAt: now,
            createdAt: now,
            updatedAt: now
        });
        if (result.status === 'unavailable') {
            return c.json({ success: false, code: 'FUDABA_CLAIM_ENVELOPE_NOT_FOUND' }, 404);
        }
        if (result.status === 'conflict') {
            return c.json({
                success: false,
                code: 'FUDABA_CLAIM_ENVELOPE_CONFLICT',
                revision: result.revision
            }, 409);
        }
        return c.json({
            success: true,
            envelope: fudabaClaimEnvelopeView(result.envelope),
            claim: fudabaCardClaimView(result.claim)
        });
    } catch (error) {
        const status = statusFromError(error);
        if (status >= 500) console.error('Failed to respond to claim envelope', error);
        return c.json({
            success: false,
            code: status >= 500
                ? 'FUDABA_CLAIM_ENVELOPE_ACTION_FAILED'
                : 'FUDABA_CLAIM_ENVELOPE_INVALID',
            message: status >= 500 ? '认领信封处理失败' : messageFromError(error)
        }, status as 400 | 500);
    }
}

export async function handleListFudabaOwnerCardClaims(
    c: Context<AppEnvironment>
): Promise<Response> {
    try {
        const claims = await fudabaRepository(c).listCardClaimsForOwner(
            c.get('platformUser')!.id,
            100
        );
        return c.json({ items: claims.map(fudabaCardClaimView) });
    } catch (error) {
        console.error('Failed to list owner card claims', error);
        return c.json({
            success: false,
            code: 'FUDABA_CARD_CLAIM_LIST_FAILED',
            message: '名片认领记录加载失败'
        }, 500);
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
            seriesCode: input.seriesCode,
            idolIds: input.favoriteIdolIds,
            message: input.message,
            createdAt: now,
            updatedAt: now
        });
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
        return c.json({ success: true, claim: fudabaCardClaimView(result.claim) }, 201);
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
