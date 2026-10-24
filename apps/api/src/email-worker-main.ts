import '@/config/load-environment';
import { createServer, type Server } from 'node:http';
import {
    createNodeEmailWorkerServices,
    type NodeEmailWorkerServices,
} from '@/runtime/node-email-worker-services';

export interface StartEmailWorkerOptions {
    host?: string;
    port?: number | string;
    createServices?: () => Promise<NodeEmailWorkerServices>;
    shutdownTimeoutMs?: number;
}

export interface RunningEmailWorker {
    server: Server;
    services: NodeEmailWorkerServices;
    shutdownTimeoutMs: number;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 60_000;

function parsePort(value: number | string): number {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error(`Invalid email worker health port: ${value}`);
    }
    return port;
}

function listen(server: Server, port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once('error', onError);
        server.listen(port, host, () => {
            server.off('error', onError);
            resolve();
        });
    });
}

async function waitUntilDeadline(
    operation: () => Promise<void>,
    deadlineAt: number,
): Promise<void> {
    const running = Promise.resolve().then(operation);
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
        void running.catch(() => undefined);
        return;
    }
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
        running,
        new Promise<void>((resolve) => {
            timer = setTimeout(resolve, remaining);
            timer.unref();
        }),
    ]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function closeServer(
    server: Server,
    deadlineAt = Number.POSITIVE_INFINITY,
): Promise<void> {
    if (!server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        const settle = (error?: Error): void => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (error) reject(error);
            else resolve();
        };
        const remaining = deadlineAt - Date.now();
        if (Number.isFinite(remaining)) {
            timer = setTimeout(() => {
                try {
                    server.closeAllConnections();
                } catch {
                    // The shutdown deadline still ends the wait.
                }
                settle();
            }, Math.max(0, remaining));
            timer.unref();
        }
        try {
            server.close((error) => settle(error ?? undefined));
        } catch (error) {
            settle(
                error instanceof Error
                    ? error
                    : new Error('Email worker health server close failed'),
            );
        }
    });
}

export async function startEmailWorker(
    options: StartEmailWorkerOptions = {},
): Promise<RunningEmailWorker> {
    const host = options.host ?? process.env.IMS_EMAIL_WORKER_HEALTH_HOST ?? '127.0.0.1';
    const port = parsePort(
        options.port ?? process.env.IMS_EMAIL_WORKER_HEALTH_PORT ?? '3001',
    );
    const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    if (!Number.isInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1) {
        throw new Error('Invalid email worker shutdown timeout');
    }
    const services = await (options.createServices ?? createNodeEmailWorkerServices)();
    const server = createServer((request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        if (request.method === 'GET' && request.url === '/health/live') {
            const live = services.runner.isLive();
            response.statusCode = live ? 200 : 503;
            response.end(live ? 'live\n' : 'not live\n');
            return;
        }
        if (request.method === 'GET' && request.url === '/health/ready') {
            const ready = services.runner.isReady();
            response.statusCode = ready ? 200 : 503;
            response.end(ready ? 'ready\n' : 'not ready\n');
            return;
        }
        response.statusCode = 404;
        response.end('not found\n');
    });
    try {
        services.runner.start();
        await listen(server, port, host);
    } catch (error) {
        await Promise.allSettled([services.close(), closeServer(server)]);
        throw error;
    }
    return { server, services, shutdownTimeoutMs };
}

export async function shutdownEmailWorker(worker: RunningEmailWorker): Promise<void> {
    const deadlineAt = Date.now() + worker.shutdownTimeoutMs;
    const outcomes = await Promise.allSettled([
        waitUntilDeadline(() => worker.services.close(deadlineAt), deadlineAt),
        closeServer(worker.server, deadlineAt),
    ]);
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
        throw new Error('Platform email worker shutdown failed');
    }
}

export function installEmailWorkerShutdown(worker: RunningEmailWorker): void {
    let shutdown: Promise<void> | undefined;
    const handleSignal = (signal: NodeJS.Signals) => {
        if (shutdown) return;
        process.stdout.write(
            `${JSON.stringify({ event: 'platform_email_worker_shutdown_started', signal })}\n`,
        );
        shutdown = shutdownEmailWorker(worker)
            .then(() => {
                process.stdout.write(
                    `${JSON.stringify({
                        event: 'platform_email_worker_shutdown_completed',
                        signal,
                    })}\n`,
                );
            })
            .catch(() => {
                process.exitCode = 1;
                process.stderr.write(
                    `${JSON.stringify({
                        event: 'platform_email_worker_shutdown_failed',
                        signal,
                    })}\n`,
                );
            });
    };
    process.once('SIGINT', handleSignal);
    process.once('SIGTERM', handleSignal);
}

if (require.main === module) {
    void startEmailWorker()
        .then((worker) => {
            const address = worker.server.address() as { port?: number } | null;
            process.stdout.write(
                `${JSON.stringify({
                    event: 'platform_email_worker_started',
                    healthPort: address?.port,
                })}\n`,
            );
            installEmailWorkerShutdown(worker);
        })
        .catch(() => {
            process.exitCode = 1;
            process.stderr.write(
                `${JSON.stringify({
                    event: 'platform_email_worker_startup_failed',
                })}\n`,
            );
        });
}
