import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardUpdateContext } from '@/domains/community/namecards/request';
import {
    toAdminNamecardDiffResponse,
    type AdminNamecardDiffResponse,
    type NamecardErrorResponse
} from '@/domains/community/namecards/response';
import { namecardRepository } from '@/middleware/hono-context';

/**
 * Rewrites the live card the way the management window shows it. The owner is
 * told per changed field, so the audit trail carries the labels too.
 */
export async function handleUpdateAdminNamecard(c: NamecardUpdateContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await namecardRepository(c).updateCardAsAdmin({
        cardNumber: id,
        expectedRevision: body.expected_revision,
        reason: body.reason,
        ownerAccountId: body.ownerAccountId,
        status: body.status,
        reviewStatus: body.review_status,
        content: {
            producerName: body.producerName,
            producerReading: body.producerReading,
            groupName: body.groupName,
            madeOn: body.madeOn,
            bio: body.bio,
            tradeNote: body.tradeNote,
            isOriginal: body.isOriginal,
            madeWithAi: body.madeWithAi,
            visible: body.visible,
            exchangeMode: body.exchangeMode,
            seriesCodes: body.seriesCodes,
            favoriteCharacterIds: body.favoriteCharacterIds,
            credits: body.credits
        },
        mediaOrder: body.media_order,
        updatedAt: new Date()
    });
    if (result.status === 'not-found') {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'conflict') {
        return c.json({
            success: false,
            error: 'Namecard changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    if (result.status === 'reason-required') {
        return c.json({
            error: '请填写修改理由',
            field: 'reason'
        } satisfies NamecardErrorResponse, 400);
    }
    if (
        result.status === 'invalid-media' ||
        result.status === 'invalid-owner' ||
        result.status === 'blocked'
    ) {
        return c.json({ error: result.message } satisfies NamecardErrorResponse, 400);
    }
    const labels = result.changedFields.map((change) => change.label).join('|');
    await writeAudit(c, '修改名片', `card_id=${id};reason=${body.reason ?? ''};revision=${result.revision};fields=${labels}`);
    // The window keeps its own draft, so it needs the row as it is now: revision
    // fences the next save and the normalised content replaces the draft.
    const diff = await namecardRepository(c).findCardDiff(id);
    if (!diff) {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    return c.json(toAdminNamecardDiffResponse(diff) satisfies AdminNamecardDiffResponse);
}
