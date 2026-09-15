import type { GuestSubmissionMediaContext } from '@/domains/community/fudaba/guest-submissions/request';
import {
    enforceSubmissionLimit,
    withdrawalTokenHash,
} from '@/domains/community/fudaba/guest-submissions/submission-guards';
import { namecardRepository, services } from '@/middleware/hono-context';
import { objectReadResponse } from '@/utils/http/object-read-response';
import { publicMediaObjectKey } from '@/utils/storage/business-object-keys';

export async function handleServeFudabaGuestSubmissionMedia(
    c: GuestSubmissionMediaContext,
): Promise<Response> {
    const { id, side } = c.req.valid('param');
    const limited = await enforceSubmissionLimit(c, id);
    if (limited) return limited;
    const tokenHash = await withdrawalTokenHash(c);
    const submission = tokenHash
        ? await namecardRepository(c).findSubmissionByTokenHash(id, tokenHash)
        : null;
    if (!submission) return c.text('Not Found', 404);
    const storage = services(c).storage;
    if (!storage) throw new Error('Object storage unavailable');
    const key = publicMediaObjectKey(
        side === 'front' ? submission.image1_url : submission.image2_url,
    );
    const response = await objectReadResponse(c.req.raw, storage, key, {
        'Cache-Control': 'private, no-store',
        'Vary': 'X-Fudaba-Guest-Submission-Token',
    });
    return response ?? c.text('Not Found', 404);
}
