const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

const username = process.env.IMS_NEW_USER_USERNAME;
const password = process.env.IMS_NEW_USER_PASSWORD;
const dept = process.env.IMS_NEW_USER_DEPT || 'editor';
const producername = process.env.IMS_NEW_USER_PRODUCER_NAME;
const packageRoot = path.resolve(__dirname, '../../..');
const projectRoot = path.resolve(packageRoot, '../..');
const configuredDbPath = process.env.IMS_SQLITE_PATH;

if (!username || !password || !producername) {
    console.error(
        'Set IMS_NEW_USER_USERNAME, IMS_NEW_USER_PASSWORD, and IMS_NEW_USER_PRODUCER_NAME.'
    );
    process.exit(1);
}

if (!configuredDbPath) {
    console.error('Set IMS_SQLITE_PATH explicitly to the authoritative SQLite database.');
    process.exit(1);
}

const dbPath = path.resolve(projectRoot, configuredDbPath);
if (!fs.existsSync(dbPath) || !fs.statSync(dbPath).isFile()) {
    console.error(`IMS_SQLITE_PATH is not an existing database file: ${dbPath}`);
    process.exit(1);
}

if (!['editor', 'op'].includes(dept)) {
    console.error('IMS_NEW_USER_DEPT must be either editor or op.');
    process.exit(1);
}

async function addUser() {
    const db = new sqlite3.Database(dbPath);
    db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
        async (schemaError, table) => {
            if (schemaError || !table) {
                console.error(schemaError?.message || 'Target database has no users table.');
                process.exitCode = 1;
                return db.close();
            }

            try {
                const passwordHash = await bcrypt.hash(password, 12);
                db.run(
                    'INSERT INTO users (username, password, dept, producername) VALUES (?, ?, ?, ?)',
                    [username, passwordHash, dept, producername],
                    function onInsert(err) {
                        if (err) {
                            if (err.code === 'SQLITE_CONSTRAINT') {
                                console.error(`Username ${username} already exists.`);
                            } else {
                                console.error(err.message);
                            }
                            process.exitCode = 1;
                        } else {
                            console.log(`User created with ID ${this.lastID}.`);
                        }
                        db.close();
                    }
                );
            } catch (error) {
                console.error(error.message);
                process.exitCode = 1;
                db.close();
            }
        }
    );
}

addUser().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
});
