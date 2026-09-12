"use strict";

// Compatibility entry for existing PM2/systemd commands. Build before starting.
const server = require("../dist/server/main.js");

if (require.main === module) {
    // pi-lens-ignore: ts:2568
    void server.startNodeServer().catch((error) => {
        process.exitCode = 1;
        console.error(
            JSON.stringify({
                event: "server_startup_failed",
                error: error instanceof Error ? error.message : String(error),
            }),
        );
    });
}

module.exports = server;
