import fs from 'node:fs';

export function writeRestrictedJsonFixture(filename, value) {
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
    });
}
