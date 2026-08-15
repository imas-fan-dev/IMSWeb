import type { NewStoryBatchInput, NewStoryInput, StoryCardRecord } from '@/ports/repositories';

export function httpError(message: string, status: number): Error {
    return Object.assign(new Error(message), { status });
}

export class WikiLayoutRevisionConflict extends Error {}
export class StoryMediaRevisionConflict extends Error {}

export function storyCardHasConflict(
    existing: StoryCardRecord,
    input: NewStoryInput | NewStoryBatchInput
): boolean {
    const hasImageConflict = Boolean(input.imageFile) &&
        input.imageFile !== existing.image_file;
    const coverAssetId = input.coverAssetId ?? null;
    const hasCoverAssetConflict = coverAssetId !== null &&
        coverAssetId !== existing.cover_asset_id;
    const hasSubtitleConflict = Boolean(input.subtitle) &&
        input.subtitle !== (existing.subtitle ?? '');
    const hasTransformConflict = Boolean(input.imageFile) && (
        input.imageTransform.fit !== existing.image_fit ||
        input.imageTransform.focalX !== existing.image_focal_x ||
        input.imageTransform.focalY !== existing.image_focal_y ||
        input.imageTransform.zoom !== existing.image_zoom ||
        input.imageTransform.rotation !== existing.image_rotation
    );
    return hasImageConflict || hasCoverAssetConflict || hasSubtitleConflict ||
        hasTransformConflict;
}
