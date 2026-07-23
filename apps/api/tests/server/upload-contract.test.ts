import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { StreamingUploadParser } from '@/adapters/node/streaming-upload-parser';
import { StandardUploadParser } from '@/adapters/shared/standard-upload-parser';
import type { ImageInfo, ImageProcessor } from '@/ports/image-processor';
import type { UploadParser } from '@/ports/upload-parser';
import { validateUploadedImage } from '@/shared/image-upload';
import { md5Hex } from '@/shared/md5';

class FixtureImages implements ImageProcessor {
    constructor(private readonly format = 'png', private readonly broken = false) {}
    async validate(): Promise<ImageInfo> {
        if (this.broken) throw new Error('decode failed');
        return { format: this.format, width: 1, height: 1, contentType: `image/${this.format}` };
    }
    async toWebp(body: Uint8Array) { return body; }
    async thumbnailPng(body: Uint8Array) { return body; }
    async resizeJpeg(body: Uint8Array) { return body; }
}

async function materializedMultipartRequest(form: FormData): Promise<Request> {
    const encoded = new Request('http://ims.test/upload', { method: 'POST', body: form });
    const contentType = encoded.headers.get('content-type');
    assert.ok(contentType);
    const body = await encoded.arrayBuffer();
    return new Request('http://ims.test/upload', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body
    });
}

for (const [name, parser] of [
    ['Node streaming', new StreamingUploadParser()],
    ['Worker standard', new StandardUploadParser()]
] as const) {
    test(`${name} multipart parser counts unknown files and enforces part limits without Content-Length`, async () => {
        const form = new FormData();
        form.append('known', new Blob(['a'], { type: 'text/plain' }), 'a.txt');
        form.append('unknown', new Blob(['b'], { type: 'text/plain' }), 'b.txt');
        const request = await materializedMultipartRequest(form);
        assert.equal(request.headers.get('content-length'), null);
        await assert.rejects(parser.parse(request, {
            maxBytes: 4096,
            fileFields: ['known'],
            maxFiles: 1,
            maxFields: 2,
            maxParts: 3
        }), (error: Error & { status?: number }) => error.status === 413);
    });

    test(`${name} multipart parser rejects raw boundary overhead at maxBytes + 1`, async () => {
        const boundary = 'ims-boundary';
        const body = new Uint8Array(65);
        const request = new Request('http://ims.test/upload', {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body
        });
        await assert.rejects(parser.parse(request, {
            maxBytes: 64,
            fileFields: ['image']
        }), (error: Error & { status?: number }) => error.status === 413);
    });

    test(`${name} multipart parser reports interrupted bodies`, async () => {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('--broken\r\n'));
                controller.error(new Error('connection reset'));
            }
        });
        const request = new Request('http://ims.test/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/form-data; boundary=broken' },
            body,
            duplex: 'half'
        } as RequestInit & { duplex: 'half' });
        await assert.rejects(parser.parse(request, {
            maxBytes: 4096,
            fileFields: ['image']
        }));
    });
}

test('shared image upload contract rejects extension, MIME, decoded format, and corrupt payload mismatches', async () => {
    const body = new Uint8Array([1, 2, 3]);
    await assert.rejects(validateUploadedImage(
        { filename: 'payload.txt', contentType: 'text/plain', body }, new FixtureImages()
    ), /图片格式不支持/);
    await assert.rejects(validateUploadedImage(
        { filename: 'payload.jpg', contentType: 'image/png', body }, new FixtureImages()
    ), /扩展名与 MIME/);
    await assert.rejects(validateUploadedImage(
        { filename: 'payload.png', contentType: 'image/png', body }, new FixtureImages('jpeg')
    ), /内容与文件格式/);
    await assert.rejects(validateUploadedImage(
        { filename: 'payload.png', contentType: 'image/png', body }, new FixtureImages('png', true)
    ), /损坏或无法解码/);
    assert.equal((await validateUploadedImage(
        { filename: 'payload.jfif', contentType: 'image/pjpeg', body }, new FixtureImages('jpeg')
    )).format, 'jpeg');
});

test('shared MD5 implementation matches RFC vectors and legacy Node hashes', () => {
    for (const value of ['', 'a', 'abc', 'message digest', 'IMS WebP bytes']) {
        const bytes = new TextEncoder().encode(value);
        assert.equal(md5Hex(bytes), crypto.createHash('md5').update(bytes).digest('hex'));
    }
});
