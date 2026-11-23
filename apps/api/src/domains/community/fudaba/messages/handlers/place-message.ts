import type { FudabaMessageResponse } from '@imsweb/contracts/fudaba/messages';
import type { FudabaMessagePlacementInput } from '@imsweb/contracts/fudaba/messages';
import { fudabaRepository } from '@/middleware/hono-context';
import { parseFudabaMessagePlacement } from '@/domains/community/fudaba/messages/request';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handlePlaceMessage(c: MessageContext) {
    return guarded(c, async () => {
        const result = await fudabaRepository(c).messages.place(
            c.req.param('messageId')!,
            c.get('platformUser')!.id,
            parseFudabaMessagePlacement(
                await c.req.json<FudabaMessagePlacementInput>(),
            ),
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
