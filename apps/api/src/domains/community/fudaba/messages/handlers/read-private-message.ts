import type { FudabaMessageResponse } from '@imsweb/contracts/fudaba/messages';
import { services } from '@/middleware/hono-context';
import { messageWriteCapabilities } from '@/domains/community/fudaba/messages/response';
import { fudabaRepository } from '@/middleware/hono-context';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleReadPrivateMessage(c: MessageContext) {
    return guarded(c, async () => {
        const result = await fudabaRepository(c).messages.read(
            c.req.param('messageId')!,
            c.get('platformUser')!.id,
        );
        return result.status === 'ok'
            ? c.json({
                  success: true,
                  message: messageWriteCapabilities(
                      result.message,
                      services(c).config?.fudabaWriteEnabled === true,
                  ),
              } satisfies FudabaMessageResponse)
            : failure(c, result);
    });
}
