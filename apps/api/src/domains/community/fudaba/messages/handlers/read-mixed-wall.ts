import { messageWriteCapabilities } from '@/domains/community/fudaba/messages/response';
import { services, fudabaRepository } from '@/middleware/hono-context';
import { mixedWallQuery } from '@/domains/community/fudaba/messages/request';
import { mixedWallView } from '@/domains/community/fudaba/messages/response';
import type { MessageContext } from '@/domains/community/fudaba/messages/response';
import {
    withMessageResponse as guarded,
    respondMessageFailure as failure,
} from '@/domains/community/fudaba/messages/response';

export function handleReadMixedWall(c: MessageContext) {
    return guarded(c, async () => {
        const slug = c.req.param('slug')!;
        const result = await fudabaRepository(c).messages.readWall(
            slug,
            c.get('platformUser')?.id ?? null,
            mixedWallQuery(c.req.url, slug)
        );
        if (!result) return failure(c, { status: 'not-found' });
        result.capabilities.canCreateMessage =
            result.capabilities.canCreateMessage &&
            services(c).config?.fudabaWriteEnabled === true &&
            services(c).config?.fudabaMessageCreateEnabled === true;
        result.capabilities.canArrangeWall =
            result.capabilities.canArrangeWall &&
            services(c).config?.fudabaWriteEnabled === true;
        if (services(c).config?.fudabaWriteEnabled !== true) {
            result.items = result.items.map((item) =>
                item.kind === 'message'
                    ? {
                          ...item,
                          message: messageWriteCapabilities(
                              item.message,
                              false
                          ),
                      }
                    : { ...item, canMove: false }
            );
        }
        return c.json(await mixedWallView(services(c).storage, result));
    });
}

async function readExtendedWall(c: MessageContext, layoutOnly: boolean) {
    return guarded(c, async () => {
        const slug = c.req.param('slug')!;
        const repository = fudabaRepository(c).messages;
        const result = await repository.readWall(
            slug,
            c.get('platformUser')?.id ?? null,
            mixedWallQuery(c.req.url, slug)
        );
        if (!result) return failure(c, { status: 'not-found' });
        const config = services(c).config;
        result.capabilities.canCreateMessage =
            result.capabilities.canCreateMessage &&
            config?.fudabaWriteEnabled === true &&
            config?.fudabaMessageCreateEnabled === true;
        result.capabilities.canArrangeWall =
            result.capabilities.canArrangeWall &&
            config?.fudabaWriteEnabled === true;
        if (config?.fudabaWriteEnabled !== true)
            result.items = result.items.map((item) =>
                item.kind === 'message'
                    ? {
                          ...item,
                          message: messageWriteCapabilities(
                              item.message,
                              false
                          ),
                      }
                    : { ...item, canMove: false }
            );
        const [wire, layouts] = await Promise.all([
            mixedWallView(services(c).storage, result),
            repository.layouts(result.items, !layoutOnly),
        ]);
        return layoutOnly
            ? c.json({
                  version: 1 as const,
                  office: wire.office,
                  wall: wire.wall,
                  items: layouts,
                  pageInfo: wire.pageInfo,
              })
            : c.json({ ...wire, version: 1 as const, layouts });
    });
}

export function handleReadWallLayout(c: MessageContext) {
    return readExtendedWall(c, true);
}
export function handleReadWallScene(c: MessageContext) {
    return readExtendedWall(c, false);
}
