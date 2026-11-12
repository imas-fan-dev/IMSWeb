import { writeAudit } from '@/domains/admin/audit/write-audit';
import type { NamecardUpdateContext } from '@/domains/community/namecards/request';
import {
    toAdminNamecardDiffResponse,
    type AdminNamecardDiffResponse,
    type NamecardErrorResponse
} from '@/domains/community/namecards/response';
import { namecardRepository, services } from '@/middleware/hono-context';
import { withAdminNamecardPages } from '@/domains/community/namecards/moderation/admin-namecard-diff-pages';
import { randomUUID } from 'node:crypto';
import { cardPageObjectKey, fudabaCardMediaVersionObjectKey } from '@/utils/storage/business-object-keys';
import { randomHex } from '@/utils/crypto/random';
import { storeCardPage } from '@/domains/community/fudaba/cards/artwork-store';
import { parseCardPageObjectKey } from '@/utils/storage/business-object-keys';
import type { FudabaCardPageWrite } from '@/ports/repositories';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

/**
 * Moves page objects that are being promoted from the pending surface to the
 * live surface. Page rows can be promoted by updateCardAsAdmin, but their
 * objects are still stored under the pending prefix; without this step the
 * live media route asks for a missing object and renders an empty image.
 */
async function publishPromotedPageObjects(
    runtime: ReturnType<typeof services>,
    artwork: {
        frontObjectKey: string;
        backObjectKey: string | null;
        middleObjectKeys: string[];
    },
): Promise<void> {
    const storage = runtime.storage;
    if (!storage) throw new Error('Object storage publication is unavailable');
    const keys = [
        artwork.frontObjectKey,
        ...artwork.middleObjectKeys,
        ...(artwork.backObjectKey ? [artwork.backObjectKey] : []),
    ];
    for (const key of keys) {
        const parsed = parseCardPageObjectKey(key);
        if (!parsed || parsed.queue !== 'pending') continue;
        const liveKey = cardPageObjectKey(
            parsed.cardId,
            'live',
            parsed.pageId,
            parsed.version,
        );
        if (!(await storage.exists(liveKey))) {
            if (!(await storage.exists(key))) {
                throw new Error(`Staged card page object not found: ${key}`);
            }
            await storage.copy(key, liveKey);
        }
        if (!storage.publish) {
            throw new Error('Object storage publication is unavailable');
        }
        await storage.publish(liveKey);
    }
}

/**
 * Rewrites the live card the way the management window shows it. The owner is
 * told per changed field, so the audit trail carries the labels too.
 */
export async function handleUpdateAdminNamecard(c: NamecardUpdateContext): Promise<Response> {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const repository = namecardRepository(c);
    /*
      旋转在保存这一下生效：先把最终落到正面/背面的对象转好，再把新键交给
      仓储。它只换图，不进审核、也不通知属主。
    */
    const createdKeys: string[] = [];
    const writtenPages: FudabaCardPageWrite[] = [];
    const replacedKeys: string[] = [];
    let nextFrontObjectKey: string | undefined;
    let nextBackObjectKey: string | null | undefined;
    /** 新对象确认可公开读取后才允许删除旧对象，否则旧图还能顶上。 */
    let replacedSafeToDelete = false;
    const rotations = body.rotations;
    const middleTurns = rotations?.middles ?? [];
    const hasMiddleRotation = middleTurns.some((turns) => turns !== 0);
    if (
        rotations &&
        ((rotations.front ?? 0) !== 0 ||
            (rotations.back ?? 0) !== 0 ||
            hasMiddleRotation)
    ) {
        const runtime = services(c);
        if (!runtime.storage || !runtime.images?.rotate) {
            throw new Error('Image rotation is unavailable');
        }
        const artwork = await repository.findAdminCardArtwork(id);
        const surface = artwork
            ? [
                  artwork.frontObjectKey,
                  ...artwork.middleObjectKeys,
                  ...(artwork.backObjectKey ? [artwork.backObjectKey] : [])
              ]
            : [];
        const ordered = body.media_order.map(
            (token) => surface[Number(token.slice(1))]
        );
        if (ordered.length > 0 && ordered.every(Boolean)) {
            const keepsStaged = body.review_status !== null;
            const rotate = async (
                key: string,
                turns: number
            ): Promise<string> => {
                const turn = ((turns % 4) + 4) % 4;
                if (turn === 0) return key;
                const object = await runtime.storage!.get(key);
                if (!object) throw new Error('Artwork image is unavailable');
                const rotated = await runtime.images!.rotate!(object.body, turn * 90);
                if (!runtime.images!.validate) {
                    throw new Error('Image validation is unavailable');
                }
                const info = await runtime.images!.validate(rotated, 'image/webp');
                const stored = await storeCardPage(runtime, {
                    cardId: artwork?.cardId ?? String(id),
                    queue: keepsStaged ? 'pending' : 'live',
                    pageId:
                        parseCardPageObjectKey(key)?.pageId ??
                        `page-${randomUUID()}`,
                    body: rotated,
                    width: info.width,
                    height: info.height,
                    accountId: 'admin'
                });
                createdKeys.push(stored.key);
                writtenPages.push({
                    pageId: stored.pageId,
                    objectVersion: stored.version,
                    width: stored.width,
                    height: stored.height
                });
                replacedKeys.push(key);
                return stored.key;
            };
            const frontTurns = rotations.front ?? 0;
            const backTurns = rotations.back ?? 0;
            if (frontTurns !== 0) {
                nextFrontObjectKey = await rotate(ordered[0]!, frontTurns);
            }
            if (backTurns !== 0 && ordered.length > 1) {
                nextBackObjectKey = await rotate(
                    ordered[ordered.length - 1]!,
                    backTurns
                );
            }
            // 中间页按 media_order 的槽位解析：第 0 是正面、最后是背面，
            // 中间的 1..n-2 与 rotations.middles 的下标一一对应。
            for (const [index, turns] of middleTurns.entries()) {
                const slot = index + 1;
                if (turns === 0 || slot >= ordered.length - 1) continue;
                await rotate(ordered[slot]!, turns);
            }
            if (
                createdKeys.length > 0 &&
                !keepsStaged &&
                body.status === 'published'
            ) {
                await Promise.all(
                    createdKeys.map((key) => runtime.storage!.publish!(key))
                );
                replacedSafeToDelete = true;
            }
        }
    }
    const promotingStagedPages =
        body.review_status === null &&
        body.status === 'published' &&
        !body.version_only;
    const stagedArtwork = promotingStagedPages
        ? await repository.findAdminCardArtwork(id)
        : null;
    if (stagedArtwork?.staged) {
        await publishPromotedPageObjects(services(c), stagedArtwork);
    }
    const result = await repository.updateCardAsAdmin({
        cardNumber: id,
        expectedRevision: body.expected_revision,
        reason: body.reason,
        ownerAccountId: body.ownerAccountId,
        status: body.status,
        reviewStatus: body.review_status,
        content: {
            producerName: body.producerName,
            producerReading: body.producerReading,
            groupName: body.groupName,
            isGroupCard: body.isGroupCard ?? undefined,
            madeOn: body.madeOn,
            bio: body.bio,
            tradeNote: body.tradeNote,
            isOriginal: body.isOriginal,
            madeWithAi: body.madeWithAi,
            visible: body.visible,
            exchangeMode: body.exchangeMode,
            seriesCodes: body.seriesCodes,
            favoriteCharacterIds: body.favoriteCharacterIds,
            credits: body.credits
        },
        mediaOrder: body.media_order,
        versionOnly: body.version_only ?? false,
        ...(nextFrontObjectKey !== undefined
            ? { nextFrontObjectKey }
            : {}),
        ...(nextBackObjectKey !== undefined
            ? { nextBackObjectKey }
            : {}),
        ...(writtenPages.length > 0 ? { pages: writtenPages } : {}),
        actor: c.get('backofficeUser')?.username ?? null,
        updatedAt: new Date()
    });
    if (result.status === 'not-found') {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    if (result.status === 'conflict') {
        return c.json({
            success: false,
            error: 'Namecard changed; refresh and retry',
            revision: result.revision
        } satisfies NamecardErrorResponse, 409);
    }
    if (result.status === 'reason-required') {
        return c.json({
            error: '请填写修改理由',
            field: 'reason'
        } satisfies NamecardErrorResponse, 400);
    }
    if (
        result.status === 'invalid-media' ||
        result.status === 'invalid-owner' ||
        result.status === 'blocked'
    ) {
        return c.json({ error: result.message } satisfies NamecardErrorResponse, 400);
    }
    // 没发布就没写入线上：此时删旧图会让名片墙直接失去图片，先留着。
    if (replacedSafeToDelete) {
        for (const key of replacedKeys) {
            await deleteObjectWithCompensation(services(c), key).catch(() => undefined);
        }
    }
    const labels = [
        ...result.changedFields.map((change) => change.label),
        ...(nextFrontObjectKey !== undefined ||
        nextBackObjectKey !== undefined ||
        hasMiddleRotation
            ? ['图片旋转']
            : [])
    ].join('|');
    await writeAudit(c, '修改名片', `card_id=${id};reason=${body.reason ?? ''};revision=${result.revision};fields=${labels}`);
    // The window keeps its own draft, so it needs the row as it is now: revision
    // fences the next save and the normalised content replaces the draft.
    const diff = await namecardRepository(c).findCardDiff(id);
    if (!diff) {
        return c.json({ error: 'Namecard not found' } satisfies NamecardErrorResponse, 404);
    }
    const response = toAdminNamecardDiffResponse(diff);
    return c.json(
        (await withAdminNamecardPages(
            c,
            id,
            response
        )) satisfies AdminNamecardDiffResponse
    );
}
