import type {
    FudabaMessageResponse,
    FudabaMessageError,
} from '@imsweb/contracts/fudaba/messages';
import { createHash, randomUUID } from 'node:crypto';
import type { FudabaMessageCreateInput } from '@imsweb/contracts/fudaba/messages';
import { services, fudabaRepository } from '@/middleware/hono-context';
import { parseFudabaMessageCreate } from '@/domains/community/fudaba/messages/request';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleCreateMessage(c: MessageContext) {
    return guarded(c, async () => {
        if (services(c).config?.fudabaMessageCreateEnabled !== true)
            return c.json(
                {
                    success: false,
                    code: 'FUDABA_MESSAGE_CREATE_DISABLED',
                    message: '留言发布暂未开放',
                } satisfies FudabaMessageError,
                503
            );
        const input = parseFudabaMessageCreate(
            await c.req.json<FudabaMessageCreateInput>()
        );
        const content = input.content.trim();
        const key = c.req.header('Idempotency-Key');
        if (!key || key.length > 200)
            return c.json(
                {
                    success: false,
                    code: 'FUDABA_MESSAGE_INVALID',
                    message: '需要有效的提交标识',
                } satisfies FudabaMessageError,
                400
            );
        const hash = (value: string) =>
            createHash('sha256').update(value).digest('hex');
        const officeId = c.req.param('officeId')!;
        const result = await fudabaRepository(c).messages.create({
            id: randomUUID(),
            officeId,
            actorId: c.get('platformUser')!.id,
            content,
            color: input.color,
            height: input.height,
            center: input.center,
            keyHash: hash(key),
            requestHash: hash(
                JSON.stringify([
                    officeId,
                    content,
                    input.color,
                    input.center ?? null,
                    ...(input.height === undefined ? [] : [input.height]),
                ])
            ),
            now: new Date().toISOString(),
        });
        return result.status === 'ok'
            ? c.json(
                  {
                      success: true,
                      message: result.message,
                  } satisfies FudabaMessageResponse,
                  201
              )
            : failure(c, result);
    });
}
