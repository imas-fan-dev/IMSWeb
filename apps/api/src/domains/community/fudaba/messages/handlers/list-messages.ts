import type { FudabaMessageListResponse } from '@imsweb/contracts/fudaba/messages';
import { services } from '@/middleware/hono-context';
import { messageWriteCapabilities } from '@/domains/community/fudaba/messages/response';
import { fudabaRepository } from '@/middleware/hono-context';
import { messageListQuery } from '@/domains/community/fudaba/messages/request';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleListMessages(mode: 'mine' | 'office' | 'admin') {
    return (c: MessageContext) =>
        guarded(c, async () => {
            const actorId =
                mode === 'admin'
                    ? String(c.get('backofficeUser')!.id)
                    : c.get('platformUser')!.id;
            const params = new URL(c.req.url).searchParams;
            const officeId =
                mode === 'office'
                    ? c.req.param('officeId')
                    : (params.get('office') ?? undefined);
            const status = (params.get('status') ?? 'all') as
                | 'all'
                | 'visible'
                | 'office-hidden'
                | 'admin-hidden';
            const result = await fudabaRepository(c).messages.list({
                actorId,
                mode,
                officeId,
                status,
                ...messageListQuery(c.req.url, [
                    mode,
                    actorId,
                    officeId ?? null,
                ]),
            });
            if (result && services(c).config?.fudabaWriteEnabled !== true)
                result.messages = result.messages.map((message) =>
                    messageWriteCapabilities(message, false),
                );
            return result
                ? c.json(result satisfies FudabaMessageListResponse)
                : failure(c, { status: 'forbidden' });
        });
}
