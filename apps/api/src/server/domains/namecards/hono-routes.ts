import type { Context } from 'hono';
import type { AppEnvironment, ImsHonoApp } from '@/app';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import type { UploadedFile } from '@/ports/upload-parser';
import {
    coreRepository,
    getClientAddress,
    messageFromError,
    positiveInteger,
    randomHex,
    safeUploadBaseName,
    services,
    statusFromError
} from '@/shared/hono-utils';
import { validateUploadedImage } from '@/shared/image-upload';
import { md5Hex } from '@/shared/md5';
import { deleteObjectWithCompensation } from '@/shared/compensation';
import { writeAudit } from '@/domains/audit/hono-service';

async function enforcePublicUploadLimit(c: Context<AppEnvironment>): Promise<Response | null> {
    const limiter = services(c).rateLimiter;
    if (!limiter) return null;
    const result = await limiter.consume('public-upload', getClientAddress(c), 30, 60 * 60);
    return result.allowed ? null : c.json({ error: 'Too many requests' }, 429);
}

function uploadedFiles(value: UploadedFile | UploadedFile[] | undefined): UploadedFile[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

export function registerNamecardRoutes(app: ImsHonoApp): void {
    app.post('/api/uploadNameCard', async (c) => {
        const limited = await enforcePublicUploadLimit(c);
        if (limited) return limited;
        const runtime = services(c);
        if (!runtime.uploads || !runtime.images || !runtime.storage) throw new Error('Upload services unavailable');
        const generated: string[] = [];
        try {
            const parsed = await runtime.uploads.parse(c.req.raw, {
                maxBytes: 6 * 1024 * 1024 + 128 * 1024,
                fileFields: ['images'],
                maxFiles: 2,
                maxFields: 4,
                maxParts: 6
            });
            const files = uploadedFiles(parsed.files.images);
            if (files.some((file) => !file.contentType.startsWith('image/'))) {
                return c.json({ msg: '只允许上传图片文件' }, 400);
            }
            if (files.length !== 2) return c.json({ msg: '必须上传2张图片' });
            if (files.some((file) => file.body.byteLength > 3 * 1024 * 1024)) {
                return c.json({ msg: '文件过大' }, 400);
            }
            const outputs: Array<{ key: string; url: string; hash: string }> = [];
            for (const file of files) {
                await validateUploadedImage(file, runtime.images);
                const webp = await runtime.images.toWebp(file.body, 85);
                const key = `uploads/namecard/original/${safeUploadBaseName(file.filename)}-${Date.now()}-${randomHex(6)}.webp`;
                await runtime.storage.put(key, webp, { contentType: 'image/webp' });
                generated.push(key);
                outputs.push({ key, url: `/${key}`, hash: md5Hex(webp) });
            }
            if (await coreRepository(c).findCardByOrderedHashes(outputs[0].hash, outputs[1].hash)) {
                await Promise.all(generated.map((key) => deleteObjectWithCompensation(runtime, key)));
                return c.json({ msg: '重复上传' });
            }
            await coreRepository(c).insertPendingCard({
                image1Url: outputs[0].url,
                image2Url: outputs[1].url,
                hash1: outputs[0].hash,
                hash2: outputs[1].hash,
                ip: getClientAddress(c)
            });
            return c.json({ msg: '上传成功，等待审核' });
        } catch (error) {
            await Promise.all(generated.map((key) =>
                deleteObjectWithCompensation(runtime, key).catch(() => undefined)
            ));
            const status = statusFromError(error);
            if (status >= 500) {
                console.error('Failed to upload namecard', error);
                return c.json({ msg: '服务器错误' }, status as 500);
            }
            return c.json({ msg: messageFromError(error) }, status as 400);
        }
    });

    app.get('/api/cards', async (c) => {
        const page = Number.parseInt(c.req.query('page') || '', 10) || 1;
        const size = Number.parseInt(c.req.query('size') || '', 10) || 25;
        try {
            const total = await coreRepository(c).countApprovedCards();
            return c.json({
                list: await coreRepository(c).listApprovedCards(size, (page - 1) * size),
                total,
                totalPage: Math.ceil(total / size)
            });
        } catch {
            return c.json({ msg: '查询失败' });
        }
    });

    app.get('/api/card/:id', async (c) => {
        const id = positiveInteger(c.req.param('id'));
        if (!id) return c.json({});
        try {
            const card = await coreRepository(c).findApprovedCardMedia(id);
            return c.json(card ? { image1_url: card.image1_url, image2_url: card.image2_url } : {});
        } catch {
            return c.json({});
        }
    });

    app.get('/api/admin/cards', coreAuth, opOnly, async (c) => {
        const page = Number.parseInt(c.req.query('page') || '', 10) || 1;
        try {
            return c.json({ success: true, data: await coreRepository(c).listAdminCards(10, (page - 1) * 10) });
        } catch {
            return c.json({ success: false });
        }
    });

    app.post('/api/admin/cards/approve/:id', coreAuth, opOnly, coreCsrf, async (c) => {
        const id = positiveInteger(c.req.param('id')) || 0;
        try {
            await coreRepository(c).approveCard(id);
            await writeAudit(c, '审核图片通过', `card_id=${id}`);
            return c.json({ success: true });
        } catch {
            return c.json({ success: false });
        }
    });

    app.delete('/api/admin/cards/:id', coreAuth, opOnly, coreCsrf, async (c) => {
        const id = positiveInteger(c.req.param('id')) || 0;
        const media = await coreRepository(c).findCardMedia(id);
        await coreRepository(c).deleteCard(id);
        if (media) {
            try {
                await Promise.all([media.image1_url, media.image2_url].map((url) =>
                    deleteObjectWithCompensation(services(c), url.replace(/^\/+/, ''))
                ));
            } catch (error) {
                console.error('Failed to clean media for committed namecard deletion', error);
            }
        }
        await writeAudit(c, '删除图片', `card_id=${id}`);
        return c.json({ success: true });
    });
}

export { enforcePublicUploadLimit };
