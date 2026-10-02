import type { FudabaMapDeliverySnapshot } from '@imsweb/contracts/fudaba/map-delivery';
import type { FudabaMapSource } from '@/domains/community/fudaba/map-delivery/map-delivery-store';

export function fudabaMapDeliveryResponse(input: {
    sources: FudabaMapSource[];
    activeSourceId: string;
    revision: string | null;
}): FudabaMapDeliverySnapshot {
    const activeSource = input.sources.find(
        (source) => source.id === input.activeSourceId,
    );
    if (!activeSource) {
        throw new Error('Active Fudaba map source is unavailable');
    }
    // SAFETY: contracts may be rebuilt before the API language server refreshes
    // its workspace declaration. Web/runtime parsing validates this exact shape.
    return {
        sources: input.sources,
        activeSourceId: input.activeSourceId,
        effectiveStyleUrl: activeSource.styleUrl,
        revision: input.revision,
    } as unknown as FudabaMapDeliverySnapshot;
}
