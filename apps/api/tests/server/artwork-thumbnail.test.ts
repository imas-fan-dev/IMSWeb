import { describe, expect, it, vi } from 'vitest';

import {
    storeArtworkThumbnail,
    type ArtworkThumbnailRuntime
} from '@/domains/community/fudaba/cards/artwork-thumbnail';

const body = new Uint8Array([1, 2, 3]);

function runtime(options: { resized?: boolean } = {}) {
    const put = vi.fn(async () => undefined);
    const resizeJpeg = vi.fn(async () => {
        if (options.resized === false) throw new Error('unsupported image');
        return new Uint8Array([9]);
    });
    return {
        put,
        resizeJpeg,
        services: {
            images: { resizeJpeg },
            storage: { put }
        } as unknown as ArtworkThumbnailRuntime
    };
}

describe('artwork thumbnails', () => {
    it('writes the 600px copy next to the original', async () => {
        const fake = runtime();
        const stored = await storeArtworkThumbnail(fake.services, {
            key: 'community/fudaba/cards/c-1/versions/v-1/media.webp',
            body,
            ownerToken: 'token-1',
            accountId: 'account-1',
            side: 'slot-0'
        });

        expect(stored).toEqual({
            key: 'community/fudaba/cards/c-1/versions/v-1/thumbnail.jpg',
            ownerToken: 'token-1'
        });
        expect(fake.resizeJpeg).toHaveBeenCalledWith(body, 600, 400, {
            maxInputPixels: 100_000_000
        });
        expect(fake.put).toHaveBeenCalledWith(
            'community/fudaba/cards/c-1/versions/v-1/thumbnail.jpg',
            new Uint8Array([9]),
            {
                contentType: 'image/jpeg',
                protectedAccess: true,
                ownerToken: 'token-1',
                metadata: {
                    kind: 'fudaba-card-thumbnail',
                    side: 'slot-0',
                    account: 'account-1'
                }
            }
        );
    });

    it('leaves the upload alone when the small copy cannot be built', async () => {
        const fake = runtime({ resized: false });
        const stored = await storeArtworkThumbnail(fake.services, {
            key: 'community/fudaba/cards/c-1/versions/v-1/front.webp',
            body,
            ownerToken: 'token-1',
            accountId: 'account-1',
            side: 'front'
        });

        expect(stored).toBeNull();
        expect(fake.put).not.toHaveBeenCalled();
    });

    it('ignores keys that are not artwork', async () => {
        const fake = runtime();
        const stored = await storeArtworkThumbnail(fake.services, {
            key: 'community/fudaba/cards/c-1/versions/v-1/notes.txt',
            body,
            ownerToken: 'token-1',
            accountId: 'account-1',
            side: 'front'
        });

        expect(stored).toBeNull();
        expect(fake.resizeJpeg).not.toHaveBeenCalled();
    });
});
