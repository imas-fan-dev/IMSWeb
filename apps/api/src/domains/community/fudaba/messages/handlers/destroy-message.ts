import type { FudabaMessageDestroyResponse } from '@imsweb/contracts/fudaba/messages';
import { fudabaRepository } from '@/middleware/hono-context';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleDestroyMessage(c: MessageContext) {
    return guarded(c, async () => {
        const id = c.req.param('messageId')!;
        const result = await fudabaRepository(c).messages.destroy(
            id,
            c.get('platformUser')!.id,
        );
        return result.status === 'ok'
            ? c.json({
                  success: true,
                  id,
                  destroyed: true,
              } satisfies FudabaMessageDestroyResponse)
            : failure(c, result);
    });
}
