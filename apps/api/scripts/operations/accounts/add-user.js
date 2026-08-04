const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const username = process.env.IMS_NEW_USER_USERNAME;
const password = process.env.IMS_NEW_USER_PASSWORD;
const dept = process.env.IMS_NEW_USER_DEPT || 'editor';
const producername = process.env.IMS_NEW_USER_PRODUCER_NAME;

if (!username || !password || !producername) {
    console.error(
        'Set IMS_NEW_USER_USERNAME, IMS_NEW_USER_PASSWORD, and IMS_NEW_USER_PRODUCER_NAME.'
    );
    process.exit(1);
}

if (!['editor', 'op'].includes(dept)) {
    console.error('IMS_NEW_USER_DEPT must be either editor or op.');
    process.exit(1);
}

function databaseUrl(environment = process.env) {
    const value = environment.DATABASE_URL?.trim();
    if (!value) throw new Error('DATABASE_URL is required for PostgreSQL');
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
        !parsed.hostname || parsed.pathname === '/') {
        throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
    }
    return value;
}

async function addUser() {
    const connectionString = databaseUrl();
    const pool = new Pool({ connectionString, application_name: 'imsweb-ops-add-user' });
    try {
        const hashed = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (username, password, dept, producername, admin_role)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (username) DO NOTHING
             RETURNING id`,
            [username, hashed, dept, producername, dept === 'op' ? 'admin' : null]
        );
        if (result.rowCount === 0) {
            console.error(`Username ${username} already exists.`);
            process.exitCode = 1;
        } else {
            console.log(`User created with ID ${result.rows[0].id}.`);
        }
    } finally {
        await pool.end();
    }
}

addUser().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
