import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, Env } from 'hono';
import type { NodeRuntimeConfig } from '@/ports/runtime-services';

type ClientAddressSource = NodeRuntimeConfig['clientAddressSource'];

export interface ClientAddressInput {
    source: ClientAddressSource;
    remoteAddress?: string;
    forwardedFor?: string;
    realIp?: string;
}

function validatedIp(value: string | undefined): string {
    const candidate = value?.trim();
    return candidate && isIP(candidate) !== 0 ? candidate : 'unknown';
}

export function resolveClientAddress(input: ClientAddressInput): string {
    if (input.source === 'direct') {
        return validatedIp(input.remoteAddress);
    }

    const trustedHeader = input.forwardedFor !== undefined
        ? input.forwardedFor
        : input.realIp;
    return validatedIp(trustedHeader);
}

export function getRequestClientAddress<E extends Env>(
    context: Context<E>,
    source: ClientAddressSource
): string {
    if (source === 'nginx') {
        return resolveClientAddress({
            source,
            forwardedFor: context.req.header('x-forwarded-for'),
            realIp: context.req.header('x-real-ip')
        });
    }

    try {
        return resolveClientAddress({
            source,
            remoteAddress: getConnInfo(context).remote.address
        });
    } catch {
        return 'unknown';
    }
}
