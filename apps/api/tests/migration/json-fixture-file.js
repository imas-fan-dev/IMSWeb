'use strict';

const fs = require('node:fs');

function writeRestrictedJsonFixture(filename, value) {
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
    });
}

module.exports = { writeRestrictedJsonFixture };
