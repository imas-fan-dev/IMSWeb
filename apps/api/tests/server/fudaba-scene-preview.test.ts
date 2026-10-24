import assert from 'node:assert/strict';
import sharp from 'sharp';
import { test } from 'vitest';
import { SharpImageProcessor } from '@/infra/media/sharp/image-processor';
import { createFudabaTinyPreview } from '@/domains/community/fudaba/card-preview';

test('tiny previews contain actual WebP pixels and stay within the scene byte budget', async () => {
    const original = await sharp({
        create: {
            width: 600,
            height: 400,
            channels: 3,
            background: { r: 230, g: 30, b: 100 },
        },
    })
        .png()
        .toBuffer();
    const preview = await createFudabaTinyPreview(
        new SharpImageProcessor(),
        original
    );
    assert.ok(preview);
    assert.ok(preview.startsWith('data:image/webp;base64,'));
    assert.ok(preview.length <= 2048);
    const bytes = Buffer.from(preview.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.ok(metadata.width! <= 32 && metadata.height! <= 32);
    const pixel = await sharp(bytes)
        .resize(1, 1)
        .removeAlpha()
        .raw()
        .toBuffer();
    assert.ok(pixel[0] > 180 && pixel[1] < 80 && pixel[2] > 60);
});
