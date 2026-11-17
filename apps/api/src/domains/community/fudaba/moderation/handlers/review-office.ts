import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { FudabaOwnerOfficeRecord } from '@/ports/repositories';
import { validFudabaOfficeId } from '@/domains/community/fudaba/contracts/office';
import { parseFudabaOfficeReview } from '@/domains/community/fudaba/moderation/request';
import { fudabaAdminOfficeReviewView } from '@/domains/community/fudaba/moderation/response';
import {
    fudabaRepository,
    getClientAddress,
    services,
} from '@/middleware/hono-context';
import { protectObjectWithCompensation } from '@/utils/storage/delete-object';
import { messageFromError, statusFromError } from '@/utils/http/error-response';

export async function handleReviewFudabaOffice(
    c: Context<AppEnvironment>,
): Promise<Response> {
    const repo = fudabaRepository(c),
        runtime = services(c);
    const id = c.req.param('officeId') || '';
    const operationId = crypto.randomUUID();
    let claimed: FudabaOwnerOfficeRecord | null = null;
    let needsProtection = false;
    let publishedKey: string | null = null;
    let completionAttempted = false;
    let expectedState: 'published' | 'rejected' | 'pending' | null = null;
    let sourceState: 'published' | 'pending' = 'pending';
    async function compensate(): Promise<void> {
        if (!claimed) return;
        if (needsProtection && publishedKey) {
            try {
                await runtime.storage!.protect!(publishedKey);
            } catch {
                const missing =
                    (await runtime.storage!.get(publishedKey)) === null;
                if (!missing) {
                    await protectObjectWithCompensation(runtime, publishedKey);
                    // Enqueueing protection is not proof that it finished. Retain the lock.
                    throw new Error(
                        'Office cover protection requires reconciliation',
                    );
                }
            }
            needsProtection = false;
        }
        await repo.releaseOfficeReview({
            officeId: id,
            expectedRevision: claimed.revision,
            operationId,
            expectedReviewState: sourceState,
        });
    }
    try {
        if (!validFudabaOfficeId(id))
            return c.json(
                { success: false, code: 'FUDABA_OFFICE_NOT_FOUND' },
                404,
            );
        const body = await c.req.json().catch(() => {
            throw Object.assign(new Error('请求体必须是有效 JSON'), {
                status: 400,
            });
        });
        const submission = parseFudabaOfficeReview(body);
        sourceState =
            submission.decision === 'withdraw' ? 'published' : 'pending';
        expectedState =
            submission.decision === 'publish'
                ? 'published'
                : submission.decision === 'withdraw'
                  ? 'pending'
                  : 'rejected';
        const begin = await repo.beginOfficeReview({
            officeId: id,
            expectedRevision: submission.expectedRevision,
            operationId,
            expectedReviewState: sourceState,
        });
        if (begin.status === 'unavailable')
            return c.json(
                { success: false, code: 'FUDABA_OFFICE_NOT_FOUND' },
                404,
            );
        if (begin.status === 'conflict')
            return c.json(
                {
                    success: false,
                    code: 'FUDABA_OFFICE_CONFLICT',
                    revision: begin.revision,
                },
                409,
            );
        claimed = begin.office;
        if (submission.decision === 'publish') {
            publishedKey =
                claimed.pending_cover_object_key ?? claimed.cover_object_key;
            if (publishedKey) {
                const storage = runtime.storage;
                const alreadyPublic =
                    !claimed.pending_cover_object_key &&
                    Boolean(
                        storage?.createPublicReadUrl
                            ? await storage.createPublicReadUrl(publishedKey)
                            : (await storage?.createReadUrl?.(publishedKey))
                                  ?.visibility === 'public',
                    );
                if (!alreadyPublic) {
                    if (!storage?.publish || !storage.protect)
                        throw new Error('Office cover publishing unavailable');
                    needsProtection = true;
                    await storage.publish(publishedKey);
                }
            }
        }
        const actor = c.get('backofficeUser')!,
            at = new Date().toISOString();
        completionAttempted = true;
        const result = await repo.completeOfficeReview({
            officeId: id,
            expectedRevision: claimed.revision,
            operationId,
            decision: submission.decision,
            reviewedAt: at,
            reviewedBy: actor.id,
            reviewNote: submission.reviewNote,
            pendingCoverObjectKey: claimed.pending_cover_object_key,
            audit: {
                username: actor.username,
                producername: actor.producername,
                action:
                    submission.decision === 'publish'
                        ? '通过 Fudaba 事务所整体审核'
                        : submission.decision === 'withdraw'
                          ? '撤回 Fudaba 事务所发布'
                          : '拒绝 Fudaba 事务所整体审核',
                target: `${id}@${claimed.revision + 1}`,
                ip: getClientAddress(c),
                time: at,
            },
        });
        completionAttempted = false;
        if (result.status !== 'saved') {
            await compensate();
            return result.status === 'unavailable'
                ? c.json(
                      { success: false, code: 'FUDABA_OFFICE_NOT_FOUND' },
                      404,
                  )
                : c.json(
                      {
                          success: false,
                          code: 'FUDABA_OFFICE_CONFLICT',
                          revision: result.revision,
                      },
                      409,
                  );
        }
        needsProtection = false;
        claimed = null;
        const item = await repo.findOfficeReview(id);
        if (!item) throw new Error('Reviewed office no longer exists');
        return c.json({
            success: true,
            item: fudabaAdminOfficeReviewView(item),
        });
    } catch (error) {
        if (claimed) {
            let safeToCompensate = !completionAttempted;
            if (completionAttempted) {
                try {
                    const current = await repo.findOfficeReview(id);
                    // Only our still-held lock proves completion did not commit.
                    safeToCompensate =
                        current?.office.review_operation_id === operationId &&
                        current.office.revision === claimed.revision;
                    if (
                        current &&
                        current.office.revision === claimed.revision + 1 &&
                        current.office.review_operation_id === null &&
                        current.office.review_state === expectedState &&
                        (expectedState === 'pending'
                            ? current.office.reviewed_at === null &&
                              current.office.reviewed_by === null &&
                              current.office.review_note === ''
                            : current.office.reviewed_at !== null) &&
                        current.office.cover_object_key ===
                            (expectedState === 'published'
                                ? (claimed.pending_cover_object_key ??
                                  claimed.cover_object_key)
                                : claimed.cover_object_key) &&
                        current.office.pending_cover_object_key ===
                            (expectedState === 'published'
                                ? null
                                : claimed.pending_cover_object_key)
                    ) {
                        return c.json({
                            success: true,
                            item: fudabaAdminOfficeReviewView(current),
                        });
                    }
                } catch {
                    safeToCompensate = false;
                }
            }
            if (safeToCompensate) {
                try {
                    await compensate();
                } catch {
                    /* Keep the locked snapshot for reconciliation. */
                }
            }
        }
        const status = statusFromError(error);
        return c.json(
            {
                success: false,
                code:
                    status >= 500
                        ? 'FUDABA_OFFICE_REVIEW_FAILED'
                        : 'FUDABA_OFFICE_INVALID',
                message:
                    status >= 500
                        ? '事务所审核未完成，请刷新核对当前版本'
                        : messageFromError(error),
            },
            status as 400 | 500,
        );
    }
}
