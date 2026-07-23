'use strict';

// Compatibility entry for existing PM2/systemd commands. Build before starting.
const server = require('../dist/server/main.js');

if (require.main === module) {
    server.startServer();
}

module.exports = server;
