import type { FudabaMapDeliverySnapshot, FudabaMapRouting } from '@imsweb/contracts/fudaba/map-delivery';
import type { FudabaMapSource } from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { describeMapProvider } from '@/domains/community/fudaba/map-delivery/map-provider-policy';

export function fudabaMapDeliveryResponse(input: {
    sources: FudabaMapSource[];
    activeSourceId: string;
    revision: string | null;
    routing?: FudabaMapRouting;
}): FudabaMapDeliverySnapshot {
    const activeSource = input.sources.find(
        (source) => source.id === input.activeSourceId,
    );
    if (!activeSource) {
        throw new Error('Active Fudaba map source is unavailable');
    }
    return {
        sources: input.sources,
        activeSourceId: input.activeSourceId,
        effectiveStyleUrl: describeMapProvider(activeSource).styleUrl,
        revision: input.revision,
        ...(input.routing ? { routing: input.routing } : {}),
    };
}
