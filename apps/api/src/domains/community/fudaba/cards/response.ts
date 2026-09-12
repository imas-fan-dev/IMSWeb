import type {
    FudabaCardInteractions,
    FudabaCardPlacement
} from '@imsweb/contracts/fudaba';
import type {
    FudabaCardInteractionStateRecord,
    FudabaCardPlacementRecord
} from '@/ports/repositories';

export function fudabaCardInteractionsView(
    state: FudabaCardInteractionStateRecord
): FudabaCardInteractions {
    return {
        likes: state.like_count,
        favorites: state.favorite_count,
        viewerLiked: state.viewer_liked,
        viewerFavorited: state.viewer_favorited
    };
}

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
