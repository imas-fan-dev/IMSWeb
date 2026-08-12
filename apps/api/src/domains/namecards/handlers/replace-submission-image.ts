import { writeAudit } from '@/domains/audit/hono-service';
import { normalizeNamecardImage } from '@/domains/namecards/namecard-image';
import {
    parseNamecardReplacementImage,
    type NamecardImageReplaceContext
} from '@/domains/namecards/request';
import {
    type NamecardErrorResponse,
    type NamecardMessageResponse,
    type NamecardResubmitResponse,
    toNamecardSubmissionResponse
} from '@/domains/namecards/response';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash
} from '@/domains/namecards/submission-support';
import { namecardRepository, services } from '@/middleware/hono-context';
import { md5Hex } from '@/utils/crypto/md5';
import { randomHex } from '@/utils/crypto/random';
import { safeUploadBaseName } from '@/utils/media/filename';
import { namecardImageObjectKey, publicMediaObjectKey } from '@/utils/storage/business-object-keys';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function handleReplaceNamecardSubmissionImage(
    c: NamecardImageReplaceContext
): Promise<Response> {
    const { id, side } = c.req.valid('param');
    const limited = await enforceSubmissionLimit(c, id);
    if (limited) return limited;
    const tokenHash = await withdrawalTokenHash(c);
    if (!tokenHash) {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    const submission = await namecardRepository(c).findSubmissionWithHashesByTokenHash(id, tokenHash);
    if (!submission) {
        return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
    }
    const expectedRevision = c.req.valid('query').expected_revision;
    if (
        expectedRevision === null ||
        submission.revision !== expectedRevision ||
        (submission.status !== 'withdrawn' && submission.status !== 'rejected')
    ) {
        return c.json({
            error: 'Submission changed; refresh and retry',
            revision: submission.revision
        } satisfies NamecardErrorResponse, 409);
    }
    const runtime = services(c);
    if (!runtime.uploads || !runtime.images || !runtime.storage) {
        throw new Error('Upload services unavailable');
    }
    const { image } = await parseNamecardReplacementImage(c);
    if (!image || !image.contentType.startsWith('image/')) {
        return c.json({ msg: '只允许上传图片文件' } satisfies NamecardMessageResponse, 400);
    }
    if (image.body.byteLength > MAX_IMAGE_BYTES) {
        return c.json({ msg: '文件过大' } satisfies NamecardMessageResponse, 400);
    }
    const webp = await normalizeNamecardImage(image, runtime.images);
    const filename = `${safeUploadBaseName(image.filename)}-${Date.now()}-${randomHex(6)}.webp`;
    const publicKey = `uploads/namecard/original/${filename}`;
    const key = namecardImageObjectKey(filename);
    const newUrl = `/${publicKey}`;
    const newHash = md5Hex(webp);
    await runtime.storage.put(key, webp, {
        contentType: 'image/webp',
        protectedAccess: true
    });
    const [hash1, hash2] = side === 'front'
        ? [newHash, submission.hash2]
        : [submission.hash1, newHash];
    const duplicate = await namecardRepository(c).findCardByOrderedHashes(hash1, hash2);
    if (duplicate && duplicate.id !== id) {
        await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        return c.json({ msg: '重复上传' } satisfies NamecardMessageResponse, 409);
    }
    const result = await namecardRepository(c).replaceSubmissionImage(
        id,
        tokenHash,
        expectedRevision,
        side,
        newUrl,
        newHash
    );
    if (result.status !== 'updated') {
        await deleteObjectWithCompensation(runtime, key).catch(() => undefined);
        if (result.status === 'not-found') {
            return c.json({ error: 'Submission not found' } satisfies NamecardErrorResponse, 404);
        }
        return c.json({
            error: 'Submission changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    const oldUrl = side === 'front' ? submission.image1_url : submission.image2_url;
    try {
        await deleteObjectWithCompensation(runtime, publicMediaObjectKey(oldUrl));
    } catch (error) {
        console.error('Failed to clean replaced namecard image', error);
    }
    await writeAudit(
        c,
        '重新上传名片图片',
        `card_id=${id};side=${side};revision=${result.card.revision}`
    );
    return c.json({
        success: true,
        submission: toNamecardSubmissionResponse(result.card)
    } satisfies NamecardResubmitResponse);
}
