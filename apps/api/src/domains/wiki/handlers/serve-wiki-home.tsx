import type { Env, Handler } from 'hono';
import type { WikiServicesResolver } from '@/domains/wiki/handler-support';
import {
    buildHomeAgencies,
    randomBackground,
    requireWikiServices
} from '@/domains/wiki/service';
import { WikiHomeTemplate } from '@/domains/wiki/templates/index';

export function createHandleServeWikiHome<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): Handler<E> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story', 'storage']);
        const [agencies, initialBg] = await Promise.all([
            buildHomeAgencies(services.story!, services.storage!),
            randomBackground(services.story!, services.storage!)
        ]);
        return context.html(
            <WikiHomeTemplate
                agencies={agencies}
                initialBg={initialBg.url ? initialBg : null}
            />
        );
    };
}
