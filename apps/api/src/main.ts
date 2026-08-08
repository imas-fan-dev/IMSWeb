import '@/config/load-environment';
import { createServer, type RequestListener, type Server } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createHonoApp } from '@/app';
import { closeNodeServices, resolveNodeServices } from '@/runtime/node-services';

export interface StartServerOptions {
    host?: string;
    port?: number | string;
}

export interface ShutdownServerOptions {
    closeServices?: () => Promise<void>;
    timeoutMs?: number;
}

function parsePort(value: number | string): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid PORT: ${value}`);
    }
    return port;
}

export { createHonoApp } from '@/app';

export const honoApp = createHonoApp(resolveNodeServices, {
    requestLogging: process.env.NODE_ENV !== 'test'
});
export const app: RequestListener = getRequestListener(honoApp.fetch);

export function startServer(options: StartServerOptions = {}): Server {
    const host = options.host || process.env.HOST || '127.0.0.1';
    const port = options.port === undefined
        ? parsePort(process.env.PORT || '3000')
        : parsePort(options.port);
    const server = createServer(app);
    server.listen(port, host, () => {
        const address = server.address();
        const boundPort = address && typeof address === 'object' ? address.port : port;
        console.log(`Server running: http://${host}:${boundPort}`);
    });
    return server;
}

function closeHttpServer(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

export async function shutdownServer(
    server: Server,
    options: ShutdownServerOptions = {}
): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const timeout = setTimeout(() => server.closeAllConnections(), timeoutMs);
    timeout.unref();
    try {
        await closeHttpServer(server);
        await (options.closeServices ?? closeNodeServices)();
    } finally {
        clearTimeout(timeout);
    }
}

export function installGracefulShutdown(server: Server): void {
    let shuttingDown: Promise<void> | undefined;
    const handleSignal = (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        console.info(JSON.stringify({ event: 'server_shutdown_started', signal }));
        shuttingDown = shutdownServer(server)
            .then(() => {
                console.info(JSON.stringify({ event: 'server_shutdown_completed', signal }));
            })
            .catch((error: unknown) => {
                process.exitCode = 1;
                console.error(JSON.stringify({
                    event: 'server_shutdown_failed',
                    signal,
                    error: error instanceof Error ? error.message : String(error)
                }));
            });
    };
    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
}

export const closeDatabase = closeNodeServices;

if (require.main === module) {
    installGracefulShutdown(startServer());
}
