import type { FudabaCardPlacement } from '@imsweb/contracts/fudaba';
import type { FudabaCardPlacementRecord } from '@/ports/repositories';

export function fudabaCardPlacementView(
    placement: FudabaCardPlacementRecord
): FudabaCardPlacement {
    return {
        pinnedAt: placement.pinned_at,
        x: placement.position_x,
        y: placement.position_y,
        rotation: placement.rotation,
        zIndex: placement.z_index,
        revision: placement.revision,
        updatedAt: placement.updated_at
    };
}
