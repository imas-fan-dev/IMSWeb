import type { FudabaMessageResponse } from '@imsweb/contracts/fudaba/messages';
import type { FudabaMessageModerationInput } from '@imsweb/contracts/fudaba/messages';
import { fudabaRepository } from '@/middleware/hono-context';
import { parseFudabaMessageModeration } from '@/domains/community/fudaba/messages/request';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleModerateMessage(layer: 'office' | 'admin') {
    return (c: MessageContext) =>
        guarded(c, async () => {
            const input = parseFudabaMessageModeration(
                await c.req.json<FudabaMessageModerationInput>(),
            );
            const actorId =
                layer === 'admin'
                    ? String(c.get('backofficeUser')!.id)
                    : c.get('platformUser')!.id;
            const result = await fudabaRepository(c).messages.moderate(
                c.req.param('messageId')!,
                actorId,
                layer,
                input.hidden,
                input.expectedRevision,
                new Date().toISOString(),
            );
            return result.status === 'ok'
                ? c.json({
                      success: true,
                      message: result.message,
                  } satisfies FudabaMessageResponse)
                : failure(c, result);
        });
}
