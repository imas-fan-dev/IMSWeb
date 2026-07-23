'use strict';

const http = require('node:http');

const startedAt = Date.now();
const server = http.createServer((_request, response) => response.end('ok'));

function report(phase, detail = {}) {
    process.stdout.write(`${JSON.stringify({
        phase,
        elapsedMs: Date.now() - startedAt,
        ...detail
    })}\n`);
}

const watchdog = setTimeout(() => {
    report('watchdog', {
        listening: server.listening,
        handles: process.getActiveResourcesInfo()
    });
    process.exit(2);
}, Number(process.env.IMS_LISTENER_PROBE_TIMEOUT_MS || 2000));

server.once('error', error => {
    clearTimeout(watchdog);
    report('error', { code: error.code, message: error.message });
    process.exitCode = 1;
});

server.listen(0, '127.0.0.1', () => {
    clearTimeout(watchdog);
    const address = server.address();
    report('listening', {
        host: address.address,
        port: address.port
    });
    server.close(error => {
        if (error) {
            report('close-error', { code: error.code, message: error.message });
            process.exitCode = 1;
            return;
        }
        report('closed');
    });
});
