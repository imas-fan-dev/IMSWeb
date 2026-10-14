import type { FudabaMessageResponse } from '@imsweb/contracts/fudaba/messages';
import type { FudabaMessageEditInput } from '@imsweb/contracts/fudaba/messages';
import { fudabaRepository } from '@/middleware/hono-context';
import { parseFudabaMessageEdit } from '@/domains/community/fudaba/messages/request';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleEditMessage(c: MessageContext) {
    return guarded(c, async () => {
        const result = await fudabaRepository(c).messages.edit(
            c.req.param('messageId')!,
            c.get('platformUser')!.id,
            parseFudabaMessageEdit(await c.req.json<FudabaMessageEditInput>()),
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
