import '@/config/load-environment';
import { createServer, type RequestListener, type Server } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createHonoApp } from '@/app';
import { closeNodeServices, resolveNodeServices } from '@/runtime/node-services';

export interface StartServerOptions {
    host?: string;
    port?: number | string;
}

function parsePort(value: number | string): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid PORT: ${value}`);
    }
    return port;
}

export { createHonoApp } from '@/app';

export const honoApp = createHonoApp(resolveNodeServices);
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

export const closeDatabase = closeNodeServices;

if (require.main === module) {
    startServer();
}
