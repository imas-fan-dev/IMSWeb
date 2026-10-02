import type { FudabaClaimEnvelope } from '@imsweb/contracts/fudaba/card-claims';
import type { FudabaClaimEnvelopeRecord } from '@/ports/repositories';

export function fudabaClaimEnvelopeView(
    envelope: FudabaClaimEnvelopeRecord
): FudabaClaimEnvelope {
    return {
        id: String(envelope.id),
        legacyCardId: envelope.legacy_card_id,
        cardId: String(envelope.legacy_card_id),
        kind: envelope.kind,
        title: envelope.title,
        body: envelope.body,
        actionState: envelope.action_state,
        claimId: envelope.claim_id,
        revision: envelope.revision,
        readAt: envelope.read_at,
        actedAt: envelope.actioned_at,
        createdAt: envelope.created_at
    };
}
